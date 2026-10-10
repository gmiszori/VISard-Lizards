#!/usr/bin/env python3
"""
Official Food2050 Weekly Menu Scraper / Parser.
Extracts structured menu items, dietary tags, allergens, and dates from Food2050 Next.js flight streams.
Usage:
  python3 parse_food2050.py <url_or_html_file>
"""
import sys
import re
import json
import urllib.request

def fetch_or_read(target):
    if target.startswith("http://") or target.startswith("https://"):
        req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.read().decode("utf-8")
    with open(target, "r", encoding="utf-8") as f:
        return f.read()

def parse_food2050(target):
    html = fetch_or_read(target)

    pattern = r"self\.__next_f\.push\((\[.*?\])\)</script>"
    chunks = re.findall(pattern, html, re.DOTALL)
    flight = ""
    for c in chunks:
        try:
            arr = json.loads(c)
            if len(arr) == 2 and arr[0] == 1 and isinstance(arr[1], str):
                flight += arr[1]
        except Exception:
            pass

    outlets_data = []

    for line in flight.split("\n"):
        if "menuCategory" not in line or "daily" not in line:
            continue
        try:
            colon_idx = line.find(":")
            if colon_idx < 0:
                continue
            payload = line[colon_idx+1:]
            record = json.loads(payload)
            outlet = None
            if isinstance(record, list):
                for elem in record:
                    if isinstance(elem, dict) and "outlet" in elem:
                        outlet = elem["outlet"]
                        break
                    if isinstance(elem, dict) and "menuCategory" in elem:
                        outlet = elem
                        break
            elif isinstance(record, dict):
                outlet = record.get("outlet", record)

            if not outlet:
                continue

            daily = outlet.get("menuCategory", {}).get("calendar", {}).get("week", {}).get("daily", [])
            for day in daily:
                date_local = day.get("from", {}).get("dateLocal", "").split("T")[0]
                weekday = day.get("from", {}).get("weekdayNumber")
                items = day.get("menuItems", [])
                day_info = {
                    "date": date_local,
                    "weekday": weekday,
                    "meals": []
                }
                for item in items:
                    dish = item.get("dish", {})
                    if not dish:
                        continue
                    name = dish.get("name", "").strip()
                    if not name:
                        continue
                    desc = dish.get("description", "").strip()
                    is_vegan = dish.get("isVegan", False)
                    is_veg = dish.get("isVegetarian", False)
                    diet_tag = "vegan" if is_vegan else ("vegetarian" if is_veg else "meat")

                    allergens = []
                    for a in dish.get("allergens", []):
                        allergen_id = a.get("allergen", {}).get("externalId")
                        if allergen_id:
                            allergens.append(allergen_id)

                    price_student = 6.10 if (is_veg or is_vegan) else 7.50
                    price_staff = 9.00 if (is_veg or is_vegan) else 10.50
                    price_external = 13.00 if (is_veg or is_vegan) else 15.50

                    for p in item.get("prices", []):
                        amt = p.get("amount")
                        cat = p.get("category", {}).get("title", "").lower()
                        if amt:
                            if "stud" in cat:
                                price_student = amt
                            elif "mitarb" in cat or "staff" in cat:
                                price_staff = amt
                            elif "ext" in cat or "gast" in cat:
                                price_external = amt

                    day_info["meals"].append({
                        "name": name,
                        "description": desc,
                        "dietTag": diet_tag,
                        "priceStudent": price_student,
                        "priceStaff": price_staff,
                        "priceExternal": price_external,
                        "allergens": allergens
                    })
                if day_info["meals"]:
                    outlets_data.append(day_info)
        except Exception:
            pass

    return outlets_data

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 parse_food2050.py <url_or_html_file>")
        sys.exit(1)

    results = parse_food2050(sys.argv[1])
    print(json.dumps(results, indent=2, ensure_ascii=False))
