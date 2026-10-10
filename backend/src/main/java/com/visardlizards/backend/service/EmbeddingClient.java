package com.visardlizards.backend.service;

import java.util.List;

/** The same model must be used for stored meal vectors and search vectors. */
public interface EmbeddingClient {
    boolean available();
    List<double[]> embed(List<String> inputs);
}
