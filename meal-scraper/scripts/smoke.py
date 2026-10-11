"""Real MCP stdio and dedicated HTTP connector smoke tests (Python standard library only)."""
import argparse
import json
import os
import pathlib
import queue
import shutil
import socket
import subprocess
import threading
import time
import urllib.request
import urllib.error

parser = argparse.ArgumentParser()
parser.add_argument('--live', action='store_true', help='Also retrieve BQM HTML and the linked PDF')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
java = shutil.which('java')
assert java, 'Java 21+ is required'
server_jar = root / 'build/tasks/_server_executableJarJvm/server-jvm-executable.jar'
connector_jar = root / 'build/tasks/_connector_executableJarJvm/connector-jvm-executable.jar'
assert server_jar.is_file() and connector_jar.is_file(), 'Package both applications first'
expected_tools = {'scrape_meals', 'discover_menu_sources', 'read_menu_source'}
messages = queue.Queue()
errors = []
process = subprocess.Popen([java, '-jar', str(server_jar)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, encoding='utf-8')

def read_stdout():
    try:
        for line in process.stdout:
            messages.put(json.loads(line))
    except Exception as error:
        messages.put(error)

def read_stderr(stream):
    for line in stream:
        errors.append(line)

threading.Thread(target=read_stdout, daemon=True).start()
threading.Thread(target=read_stderr, args=(process.stderr,), daemon=True).start()
request_id = 0

def request(method, params):
    global request_id
    request_id += 1
    process.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params}) + '\n')
    process.stdin.flush()
    while True:
        message = messages.get(timeout=240)
        if isinstance(message, Exception):
            raise message
        if message.get('id') == request_id:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message['result']

def call(name, url):
    result = request('tools/call', {'name': name, 'arguments': {'url': url}})
    assert not result.get('isError'), result
    assert json.loads(result['content'][0]['text']) == result['structuredContent']
    return result['structuredContent']

def verify_bqm(result):
    meals = result['meals']
    assert result['status'] == 'meals_found', result
    assert len(meals) == 17, [(m['name'], m['price']) for m in meals]
    assert len({m['id'] for m in meals}) == len(meals)
    assert any('Nachos' in m['name'] and 'Big' in m['name'] for m in meals)
    assert any('Nachos' in m['name'] and 'Small' in m['name'] for m in meals)
    assert all(m['sourcePage'] == 6 and m['price']['currency'] == 'CHF' for m in meals)
    assert all(m['date'] is None and m['timeStart'] is None and m['timeEnd'] is None for m in meals)
    assert next(m for m in meals if m['name'] == 'Pizzetta Margherita')['price']['amount'] == 6.9
    assert next(m for m in meals if m['name'] == 'French Pizza')['dietaryLabels'] == []

def stop(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)

try:
    request('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {},
                          'clientInfo': {'name': 'mensa-smoke', 'version': '1.0'}})
    process.stdin.write(json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n')
    process.stdin.flush()
    tools = request('tools/list', {})['tools']
    assert {tool['name'] for tool in tools} == expected_tools
    assert all(tool['annotations']['readOnlyHint'] for tool in tools)
    assert all('date' in tool['inputSchema']['properties'] for tool in tools)
    invalid_date = request('tools/call', {'name': 'scrape_meals', 'arguments': {'url': 'https://example.org', 'date': '2026-02-30'}})
    assert invalid_date.get('isError'), invalid_date
    invalid = request('tools/call', {'name': 'scrape_meals', 'arguments': {'url': 'https://127.0.0.1'}})
    assert invalid.get('isError'), invalid
    print('PASS real MCP initialization, tool discovery, readonly hints and unsafe URL rejection')
    if args.live:
        discovery = call('discover_menu_sources', 'https://bqm-bar.ch/de')
        pdf = next(source for source in discovery['sources'] if 'Menu_BQM-Bar.pdf' in source['url'])
        result = call('scrape_meals', 'https://bqm-bar.ch/de')
        verify_bqm(result)
        direct = call('read_menu_source', pdf['url'])
        assert {m['id'] for m in direct['meals']} == {m['id'] for m in result['meals']}
        (root / 'artifacts').mkdir(exist_ok=True)
        (root / 'artifacts/bqm-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS live MCP BQM: 17 unique meals, portion variants, prices, labels and page evidence')
finally:
    process.stdin.close()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        stop(process)

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
environment = os.environ.copy()
environment.update(MEAL_CONNECTOR_HOST='127.0.0.1', MEAL_CONNECTOR_PORT=str(port), MEAL_CONNECTOR_TOKEN='smoke-secret',
                   MEAL_CONNECTOR_ALLOWED_ORIGINS='http://localhost:5173')
connector = subprocess.Popen([java, '-jar', str(connector_jar), str(server_jar)], env=environment,
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, encoding='utf-8')
threading.Thread(target=read_stderr, args=(connector.stderr,), daemon=True).start()

def http(path, body=None, authorize=True, origin=None):
    headers = {'Content-Type': 'application/json'}
    if authorize:
        headers['Authorization'] = 'Bearer smoke-secret'
    if origin:
        headers['Origin'] = origin
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}',
                                 None if body is None else json.dumps(body).encode(), headers)
    try:
        with urllib.request.urlopen(req, timeout=240) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as response:
        return response.code, json.load(response)

try:
    deadline = time.monotonic() + 30
    while True:
        try:
            status, health = http('/health')
            assert status == 200 and health['mcpConnected'], health
            break
        except urllib.error.URLError:
            assert connector.poll() is None, ''.join(errors[-20:])
            assert time.monotonic() < deadline, ''.join(errors[-20:])
            time.sleep(.2)
    assert http('/health', authorize=False)[0] == 401
    assert http('/api/meals/scrape')[0] == 405
    assert http('/api/meals/scrape', {'url': 'https://localhost'})[0] == 400
    print('PASS real HTTP connector startup, dedicated MCP connection, auth and input validation')
    status, catalog = http('/api/ai/tools', origin='http://localhost:5173')
    assert status == 200, catalog
    assert {tool['name'] for tool in catalog['tools']} == expected_tools
    assert all(tool['type'] == 'function' and tool['strict'] for tool in catalog['tools'])
    assert all(tool['parameters']['additionalProperties'] is False and tool['parameters']['required'] == ['url'] for tool in catalog['tools'])
    assert http('/api/ai/tools', origin='https://untrusted.example')[0] == 403
    assert http('/api/ai/tools/call', {'call_id': 'call_bad', 'name': 'execute_shell', 'arguments': {}})[0] == 400
    print('PASS live MCP schemas exposed as OpenAI tools, frontend CORS and invalid tool rejection')
    if args.live:
        status, result = http('/api/meals/scrape', {'url': 'https://bqm-bar.ch/de'})
        assert status == 200, result
        verify_bqm(result)
        assert 'structuredContent' not in result
        (root / 'artifacts/bqm-http-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS live HTTP -> Kotlin MCP -> BQM: raw meal JSON, 17 entries, no duplicates')
        def relay_call(name, url, call_id):
            status, output = http('/api/ai/tools/call', {
                'type': 'function_call', 'id': 'fc_smoke', 'status': 'completed',
                'call_id': call_id, 'name': name, 'arguments': json.dumps({'url': url})
            }, origin='http://localhost:5173')
            assert status == 200, output
            assert output['type'] == 'function_call_output' and output['call_id'] == call_id
            return json.loads(output['output'])
        discovery = relay_call('discover_menu_sources', 'https://bqm-bar.ch/de', 'call_discover')
        pdf = next(source for source in discovery['sources'] if 'Menu_BQM-Bar.pdf' in source['url'])
        relayed = relay_call('scrape_meals', 'https://bqm-bar.ch/de', 'call_scrape')
        verify_bqm(relayed)
        direct = relay_call('read_menu_source', pdf['url'], 'call_read')
        assert {m['id'] for m in direct['meals']} == {m['id'] for m in relayed['meals']}
        (root / 'artifacts/bqm-relay-result.json').write_text(json.dumps(relayed, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS OpenAI-shaped function calls -> HTTP relay -> all 3 MCP tools -> live BQM, 17 meals')
finally:
    # On Windows terminate() is not graceful. Track and stop the test connector's child too.
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(connector.pid), '/T', '/F'], capture_output=True)
        connector.wait(timeout=8)
    else:
        stop(connector)
