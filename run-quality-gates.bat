@echo off
echo Running quality gates for freshtrack-pro project...
echo.

echo Step 1: Installing dependencies...
wsl -d Ubuntu -e bash -c "cd /home/skynet/freshtrack-pro-local/fresh-staged && npm install"
if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    exit /b %errorlevel%
)
echo ✓ Dependencies installed successfully
echo.

echo Step 2: Running build process...
wsl -d Ubuntu -e bash -c "cd /home/skynet/freshtrack-pro-local/fresh-staged && npm run build"
if %errorlevel% neq 0 (
    echo Error: Build process failed
    exit /b %errorlevel%
)
echo ✓ Build completed successfully
echo.

echo Step 3: Running test suite...
wsl -d Ubuntu -e bash -c "cd /home/skynet/freshtrack-pro-local/fresh-staged && npm test"
if %errorlevel% neq 0 (
    echo Error: Tests failed
    exit /b %errorlevel%
)
echo ✓ All tests passed
echo.

echo Step 4: Checking for linting issues...
wsl -d Ubuntu -e bash -c "cd /home/skynet/freshtrack-pro-local/fresh-staged && npm run lint"
if %errorlevel% neq 0 (
    echo Error: Linting issues found
    exit /b %errorlevel%
)
echo ✓ No linting issues found
echo.

echo ✨ All quality gates passed! ✨