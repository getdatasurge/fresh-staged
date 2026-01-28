import subprocess
import sys

print("Running quality gates for freshtrack-pro project...")
print()

# Run WSL commands directly
try:
    print("Step 1: Installing dependencies...")
    result = subprocess.run(
        ['wsl', '-d', 'Ubuntu', '-e', 'bash', '-c', 
         'cd /home/skynet/freshtrack-pro-local/fresh-staged && npm install'],
        check=True,
        capture_output=True,
        text=True
    )
    if result.stdout:
        print(result.stdout)
    print("✓ Dependencies installed successfully")
    print()

    print("Step 2: Running build process...")
    result = subprocess.run(
        ['wsl', '-d', 'Ubuntu', '-e', 'bash', '-c', 
         'cd /home/skynet/freshtrack-pro-local/fresh-staged && npm run build'],
        check=True,
        capture_output=True,
        text=True
    )
    if result.stdout:
        print(result.stdout)
    print("✓ Build completed successfully")
    print()

    print("Step 3: Running test suite...")
    result = subprocess.run(
        ['wsl', '-d', 'Ubuntu', '-e', 'bash', '-c', 
         'cd /home/skynet/freshtrack-pro-local/fresh-staged && npm test'],
        check=True,
        capture_output=True,
        text=True
    )
    if result.stdout:
        print(result.stdout)
    print("✓ All tests passed")
    print()

    print("Step 4: Checking for linting issues...")
    result = subprocess.run(
        ['wsl', '-d', 'Ubuntu', '-e', 'bash', '-c', 
         'cd /home/skynet/freshtrack-pro-local/fresh-staged && npm run lint'],
        check=True,
        capture_output=True,
        text=True
    )
    if result.stdout:
        print(result.stdout)
    print("✓ No linting issues found")
    print()

    print("✨ All quality gates passed! ✨")

except subprocess.CalledProcessError as e:
    print(f"Error: Command failed with exit code {e.returncode}")
    if e.stdout:
        print("\nOutput:")
        print(e.stdout)
    if e.stderr:
        print("\nError:")
        print(e.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)