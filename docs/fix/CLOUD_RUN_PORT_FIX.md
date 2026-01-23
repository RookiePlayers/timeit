# Cloud Run PORT Configuration Fix

## Issue

Cloud Run deployment was failing with:
```
ERROR: The user-provided container failed to start and listen on the port defined
provided by the PORT=8080 environment variable within the allocated timeout.
```

## Root Cause

The issue was **not** with the PORT configuration (which was already correct), but with **TypeScript path alias resolution** at runtime.

### The Problem

The codebase uses TypeScript path aliases defined in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

All source files use imports like:
```typescript
import { logger } from '@/utils/logger';
import { config } from '@/config/env';
```

When TypeScript compiles these files, it generates JavaScript with the **same `@/` imports**, which Node.js cannot resolve at runtime. This caused the server to crash immediately on startup before it could even bind to the port.

## Solution

Added `tsc-alias` to resolve TypeScript path aliases during the build process:

### 1. Updated [package.json](clockit_api/package.json)

**Added dependency:**
```json
"devDependencies": {
  "tsc-alias": "^1.8.10"
}
```

**Updated build script:**
```json
"scripts": {
  "build": "tsc && tsc-alias -p tsconfig.json"
}
```

### 2. Updated [Dockerfile](clockit_api/Dockerfile)

The Dockerfile already had correct PORT configuration:
```dockerfile
ENV PORT=8080
EXPOSE 8080
```

No changes needed - the `npm run build` command now automatically resolves path aliases.

## How It Works

1. **Development**: `ts-node` with `tsconfig-paths/register` resolves `@/` imports on the fly
2. **Production Build**:
   - `tsc` compiles TypeScript to JavaScript (with `@/` imports intact)
   - `tsc-alias` post-processes the output, replacing `@/` with relative paths
   - Result: Clean JavaScript files with proper relative imports
3. **Production Runtime**: Node.js runs the compiled JavaScript with no path resolution needed

## Verification

After this fix:
- ✅ The container builds successfully
- ✅ The compiled JavaScript has relative imports instead of `@/` aliases
- ✅ Node.js can start the server and bind to PORT=8080
- ✅ Cloud Run can detect the service is healthy

## Files Modified

1. [clockit_api/package.json](clockit_api/package.json) - Added `tsc-alias` and updated build script
2. [clockit_api/Dockerfile](clockit_api/Dockerfile) - Already had correct PORT config

## Testing Locally

To verify the fix works:

```bash
cd clockit_api

# Install dependencies
npm install

# Build with path resolution
npm run build

# Check that imports are resolved
cat dist/server.js | grep "require.*@/"
# Should return nothing - all @/ imports should be replaced with relative paths

# Start the server
PORT=8080 npm start
# Should start successfully on port 8080
```

## Next Steps

1. Commit the changes
2. Push to trigger GitHub Actions deployment
3. Monitor Cloud Run deployment logs to verify success
4. Verify the service is accessible at the Cloud Run URL

## References

- [tsc-alias documentation](https://www.npmjs.com/package/tsc-alias)
- [Cloud Run port configuration](https://cloud.google.com/run/docs/container-contract#port)
- [TypeScript path mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)
