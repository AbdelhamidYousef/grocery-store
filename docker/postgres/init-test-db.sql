-- Runs once, the first time the data volume is created (docker-entrypoint-initdb.d).
-- Integration tests get their own database so they can truncate freely without touching dev data.
CREATE DATABASE ecommerce_test;
