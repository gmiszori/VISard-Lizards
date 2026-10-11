package com.visardlizards.backend.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.visardlizards.backend.service.RecipeService;
import com.visardlizards.backend.service.RecipeService.Recipe;
import com.visardlizards.backend.service.RecipeService.RecipeRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/recipes")
public class RecipeController {
    private final RecipeService recipes;

    public RecipeController(RecipeService recipes) {
        this.recipes = recipes;
    }

    @PostMapping
    public Recipe generate(@Valid @RequestBody RecipeRequest request) {
        return recipes.generate(request);
    }
}
