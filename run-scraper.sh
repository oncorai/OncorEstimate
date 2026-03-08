#!/bin/bash
cd /home/ubuntu/clawd
xvfb-run --auto-servernum node sheriff-deed-scraper.js 2>&1 | tee scraper.log
