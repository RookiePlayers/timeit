# Quick Fix for 500 Errors - Clockit API

## What Changed

I've fixed the three critical issues causing 500 errors in production:

### ✅ Code Fixes (Already Applied)

1. **Trust Proxy Configuration** - [app.ts:18](clockit_api/src/app.ts#L18)
   - Added `app.set('trust proxy', true)` to handle Cloud Run's reverse proxy headers
   - Fixes the `express-rate-limit` ValidationError

2. **CORS Configuration** - [app.ts:24-47](clockit_api/src/app.ts#L24-L47)
   - Improved origin validation with trailing slash normalization
   - Added debug logging for blocked origins
   - Explicitly configured OPTIONS preflight requests

3. **Auto-detect API_BASE_URL** - [cloudbuild-api.yaml:45-63](cloudbuild-api.yaml#L45-L63)
   - Cloud Build now auto-detects the Cloud Run URL
   - No need to manually maintain the `API_BASE_URL` secret anymore

## Deploy the Fix

### Step 1: Commit and Push Changes

```bash
git add clockit_api/src/app.ts cloudbuild-api.yaml .github/workflows/deploy-api.yml
git commit -m "fix: Resolve 500 errors - add trust proxy, fix CORS, auto-detect API_BASE_URL"
git push origin feature/clockit-online
```

### Step 2: Verify GitHub Secrets

Make sure you have this secret set in your GitHub repo (Settings → Secrets and variables → Actions):

- `API_ALLOWED_ORIGINS` = `https://clockit.octech.dev`

**Note**: You can now **delete** the `API_BASE_URL` secret - it's auto-detected!

### Step 3: Trigger Deployment

The workflow should auto-trigger on push, or you can manually trigger it from GitHub Actions.

### Step 4: Verify the Fix

After deployment, test your API:

```bash
# Should return 200 OK
curl -X OPTIONS https://clockit-api-ie4o3wu3ta-ez.a.run.app/api/v1/stats \
  -H "Origin: https://clockit.octech.dev" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Check the logs for any remaining errors
gcloud run services logs read clockit-api --region europe-west4 --limit=50
```

## What to Expect

After deployment:

- ✅ No more `X-Forwarded-For` ValidationError
- ✅ CORS will allow requests from `https://clockit.octech.dev`
- ✅ `API_BASE_URL` will automatically be set to the correct Cloud Run URL
- ✅ Your website at clockit.octech.dev should work properly

## Troubleshooting

If you still see errors after deployment:

1. **Check CORS logs**: Look for "CORS blocked origin" warnings in Cloud Run logs
2. **Verify environment variables**:
   ```bash
   gcloud run services describe clockit-api --region europe-west4 --format="value(spec.template.spec.containers[0].env)"
   ```
3. **Test with curl**: Use the curl command above to test CORS headers

## Questions?

See the full [DEPLOY.md](DEPLOY.md#500-internal-server-errors) for detailed troubleshooting.
