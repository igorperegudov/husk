#!/bin/sh
# Kernel: uppercase stdin -> stdout. Any language works; this one is one line.
exec tr 'a-z' 'A-Z'
