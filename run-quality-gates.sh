#!/bin/bash

echo "Running quality gates for freshtrack-pro project..."
echo ""

echo "Step 1: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error: Failed to install dependencies"
    exit 1
fi
echo "✓ Dependencies installed successfully"
echo ""

echo "Step 2: Running build process..."
npm run build
if [ $? -ne 0 ]; then
    echo "Error: Build process failed"
    exit 1
fi
echo "✓ Build completed successfully"
echo ""

echo "Step 3: Running test suite..."
npm test
if [ $? -ne 0 ]; then
    echo "Error: Tests failed"
    exit 1
fi
echo "✓ All tests passed"
echo ""

echo "Step 4: Checking for linting issues..."
npm run lint
if [ $? -ne 0 ]; then
    echo "Error: Linting issues found"
    exit 1
fi
echo "✓ No linting issues found"
echo ""

echo "✨ All quality gates passed! ✨"
