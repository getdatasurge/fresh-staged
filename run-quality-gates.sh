#!/bin/bash
cd /home/skynet/freshtrack-pro-local/fresh-staged

echo "=== Running Quality Gates for tRPC Migration ==="
echo "=============================================="

echo ""
echo "1. Running Frontend Tests"
echo "------------------------"
npm test

echo ""
echo "2. Running Backend Tests"
echo "------------------------"
cd backend
npm test
cd ..

echo ""
echo "3. Running Frontend Build"
echo "------------------------"
npm run build

echo ""
echo "4. Running Backend Build"
echo "------------------------"
cd backend
npm run build
cd ..

echo ""
echo "5. Running Linting"
echo "------------------------"
npm run lint

echo ""
echo "=============================================="
echo "Quality Gates Complete!"
