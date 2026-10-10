package com.visardlizards.backend.exception;

/** The request conflicts with stored data, e.g. a user rating the same meal twice. */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}

}
