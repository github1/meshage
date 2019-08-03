#!/usr/bin/env bash

DIST="./dist"
rm -rf "${DIST}"
mkdir -p "${DIST}"
cp -R package.json "${DIST}/"