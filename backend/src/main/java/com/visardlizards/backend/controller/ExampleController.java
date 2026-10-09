package com.visardlizards.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/example/path")
public class ExampleController {
	
	//Usually, return serializable objects, not String or primitive types. Most objects
	//can automatically be converted to JSON.
	@GetMapping("/{example-parameter}")
	public String getExampleString(@PathVariable("example-parameter") String exampleParam) {
		return "You can use GetMapping, PutMapping, PostMapping, etc. depending on the HTPP method. :)\n"
				+ "Configure a path per controller and per endpoint. You can use parameters via curled brackets.\n"
				+ "This time, example-parameter equals " + exampleParam + ".\n"
				+ "The endpoint can then be reached via localhost:8080/example/path/<any String you like>.";
	}
	

}
