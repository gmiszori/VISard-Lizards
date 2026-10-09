All endpoints belong into "controller".
All Repository classes for connecting to a DB belong into "repository". We're gonna use JPA...?
Service layer into "service". Services should not know about DB types nor Data Transfer Objects (DTOs).
POJOs or Records storing our data belong into the coressponsing subpackage of "model". "db" for Database Entities. Domain models into "domain", everything sent directly to the frontend into "dto".

All Endpoints should return Java objects or Records; if default configuration is okay, it should automatically be tranformed to JSON.
Yes, ExampleController is a bad example for this.