package com.visardlizards.backend.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.service.LiveMenuImportService;
import com.visardlizards.backend.service.LiveMenuImportService.ImportResult;

/**
 * @author Nikita & Jona because AI wasn't helping
 */
@RestController
@RequestMapping("/api/trigger-update")
public class MealUpdateTriggerController {
	
	private LiveMenuImportService importService;
	
	@Autowired
	private MealUpdateTriggerController(LiveMenuImportService importService) {
		this.importService = importService;
	}
	
	@GetMapping("")
	public ImportResult triggerUpdate() {
		return importService.importEthMenus();
	}

}
