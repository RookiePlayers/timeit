# Clockit Deployment Guide

## Architecture

```
┌──────────────────────┐
│  Firebase Hosting    │  ← Frontend (already deployed)
│  (clockit_website)   │
└──────────┬───────────┘
           │
           │ API calls
           ▼
┌──────────────────────┐
│   Google Cloud Run   │
├──────────────────────┤
│  clockit-api         │  ← REST API (Port 3001)
│  clockit-socket      │  ← WebSocket (Port 8080)
└──────────┬───────────┘
           │
           ▼
    ┌──────────────┐
    │   Firebase   │
    │  Auth + DB   │
    └──────────────┘
```

## Cost: $0-5/month

Both services on Cloud Run free tier!

---

## Quick Deploy (10 minutes)

### Prerequisites

```bash
# Install gcloud CLI (if not installed)
curl https://sdk.cloud.google.com | bash

# Login and set project
gcloud auth login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
```

### Step 1: Enable APIs (one-time)

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com
```

### Step 2: Deploy API Server

```bash
cd clockit_api

gcloud run deploy clockit-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --memory 512Mi \
  --timeout 300s

# Get URL
gcloud run services describe clockit-api \
  --region us-central1 \
  --format 'value(status.url)'
```

**Output**: `https://clockit-api-xyz-uc.a.run.app`

### Step 3: Deploy Socket Server

```bash
cd ../clockit-server

gcloud run deploy clockit-socket \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --memory 512Mi \
  --timeout 3600s \
  --session-affinity

# Get URL
gcloud run services describe clockit-socket \
  --region us-central1 \
  --format 'value(status.url)'
```

**Output**: `https://clockit-socket-xyz-uc.a.run.app`

### Step 4: Add Environment Variables

#### For clockit-api:

**CRITICAL**: You must set the `API_BASE_URL` to your actual Cloud Run URL (not localhost) and include your production domain in `ALLOWED_ORIGINS`.

```bash
# First, get your Cloud Run URL
API_URL=$(gcloud run services describe clockit-api --region us-central1 --format 'value(status.url)')

# Then update environment variables
gcloud run services update clockit-api \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production,API_BASE_URL=${API_URL},ALLOWED_ORIGINS=https://clockit.octech.dev,https://your-firebase-app.web.app,FIREBASE_SERVICE_ACCOUNT_B64=your-base64-encoded-service-account"
```

Or use Secret Manager for sensitive data:

```bash
# Create secrets
echo -n "your-project-id" | gcloud secrets create FIREBASE_PROJECT_ID --data-file=-
echo -n "your-service-account@project.iam.gserviceaccount.com" | gcloud secrets create FIREBASE_CLIENT_EMAIL --data-file=-
cat firebase-key.txt | gcloud secrets create FIREBASE_PRIVATE_KEY --data-file=-

# Update service to use secrets
gcloud run services update clockit-api \
  --region us-central1 \
  --update-secrets="FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest,FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest,FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest"
```

#### For clockit-socket:

```bash
gcloud run services update clockit-socket \
  --region us-central1 \
  --set-env-vars="FIREBASE_PROJECT_ID=your-project-id,REDIS_URL=your-redis-url,NODE_ENV=production"
```

### Step 5: Update Firebase Hosting Config

Update your Firebase hosting config to point to the new Cloud Run services:

```json
{
  "hosting": {
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "clockit-api",
          "region": "us-central1"
        }
      },
      {
        "source": "/socket/**",
        "run": {
          "serviceId": "clockit-socket",
          "region": "us-central1"
        }
      }
    ]
  }
}
```

Or use environment variables in your frontend:

```bash
# In Firebase Hosting environment config
NEXT_PUBLIC_API_URL=https://clockit-api-xyz-uc.a.run.app
NEXT_PUBLIC_SOCKET_URL=https://clockit-socket-xyz-uc.a.run.app
```

---

## Alternative: Deploy with Cloud Build (Auto-deploy from GitHub)

### Setup (one-time)

1. **Create service account**:

```bash
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create key
gcloud iam service-accounts keys create github-key.json \
  --iam-account=github-actions@PROJECT_ID.iam.gserviceaccount.com
```

2. **Add GitHub secrets**:
   - `GCP_PROJECT_ID`: Your project ID
   - `GCP_SA_KEY`: Contents of `github-key.json`

3. **Push to main** → Auto-deploy!

---

## Management Commands

### View Logs

```bash
# API logs
gcloud run services logs read clockit-api --region us-central1 --follow

# Socket logs
gcloud run services logs read clockit-socket --region us-central1 --follow
```

### Update Environment Variables

```bash
# Update API
gcloud run services update clockit-api \
  --region us-central1 \
  --set-env-vars="KEY=value"

# Update Socket
gcloud run services update clockit-socket \
  --region us-central1 \
  --set-env-vars="KEY=value"
```

### Scale Configuration

```bash
# Set max instances (control costs)
gcloud run services update clockit-api \
  --region us-central1 \
  --max-instances=10

# Set min instances (reduce cold starts, costs more)
gcloud run services update clockit-api \
  --region us-central1 \
  --min-instances=1
```

### Get Service URLs

```bash
# API URL
gcloud run services describe clockit-api \
  --region us-central1 \
  --format 'value(status.url)'

# Socket URL
gcloud run services describe clockit-socket \
  --region us-central1 \
  --format 'value(status.url)'
```

---

## WebSocket Considerations

Cloud Run supports WebSockets with these settings:

1. **Session Affinity**: Enabled (via `--session-affinity` flag)
2. **Timeout**: Set to 3600s (1 hour) for long-lived connections
3. **HTTP/2**: Disabled for WebSocket compatibility

### Important Notes:

- Cloud Run will close idle WebSocket connections after 1 hour
- Implement ping/pong to keep connections alive
- Handle reconnection logic in your client

### Example WebSocket Keep-Alive:

**Server** (clockit-server):
```typescript
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Every 30 seconds
```

**Client** (Frontend):
```typescript
const ws = new WebSocket('wss://clockit-socket-xyz-uc.a.run.app');

ws.onopen = () => {
  setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000); // Every 30 seconds
};
```

---

## Cost Breakdown

### Free Tier (Monthly)
- **2 million requests** (combined for both services)
- **360,000 GB-seconds** of memory
- **180,000 vCPU-seconds**

### Real-World Costs

**Small App** (~10k requests/day):
- Both services: **FREE** ✅
- Within free tier limits

**Medium App** (~50k requests/day):
- clockit-api: ~$0.50/month
- clockit-socket: ~$0.50/month
- **Total: ~$1/month**

**Large App** (~200k requests/day):
- clockit-api: ~$2.50/month
- clockit-socket: ~$2.50/month
- **Total: ~$5/month**

---

## Monitoring

### Cloud Console Dashboard

Visit: [Cloud Run Console](https://console.cloud.google.com/run)

**Metrics available**:
- Request count
- Request latency (p50, p95, p99)
- Error rate
- Memory usage
- CPU usage
- Active instances

### Set Up Alerts

```bash
# Example: Alert on high error rate
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="API High Error Rate" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

---

## Troubleshooting

### Service Won't Start

1. **Check logs**:
   ```bash
   gcloud run services logs read clockit-api --region us-central1 --limit=100
   ```

2. **Check environment variables**:
   ```bash
   gcloud run services describe clockit-api --region us-central1
   ```

3. **Test locally**:
   ```bash
   cd clockit_api
   npm install
   npm start
   ```

### WebSocket Connection Fails

1. **Use `wss://` protocol** (not `ws://`)
2. **Check CORS settings** in clockit-server
3. **Verify session affinity** is enabled
4. **Test with WebSocket client**:
   ```bash
   npm install -g wscat
   wscat -c wss://clockit-socket-xyz-uc.a.run.app
   ```

### CORS Errors

Update `ALLOWED_ORIGINS` environment variable:

```bash
gcloud run services update clockit-api \
  --region us-central1 \
  --update-env-vars="ALLOWED_ORIGINS=https://your-firebase-app.web.app,https://your-custom-domain.com"
```

### 500 Internal Server Errors

If you see 500 errors in Cloud Run logs, check these common issues:

#### 1. Express Rate Limit ValidationError

**Symptom**: Logs show `ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false`

**Solution**: The code now includes `app.set('trust proxy', true)` in [app.ts:18](clockit_api/src/app.ts#L18). This is required for Cloud Run since it acts as a reverse proxy.

#### 2. CORS Configuration Issues

**Symptom**: Logs show `Not allowed by CORS` errors for OPTIONS requests

**Solution**:

1. Make sure `https://clockit.octech.dev` is in your `ALLOWED_ORIGINS`:

   ```bash
   gcloud run services update clockit-api \
     --region europe-west4 \
     --update-env-vars="ALLOWED_ORIGINS=https://clockit.octech.dev"
   ```

2. The code now handles trailing slashes automatically in [app.ts:24-47](clockit_api/src/app.ts#L24-L47)

#### 3. Incorrect API_BASE_URL

**Symptom**: API_BASE_URL is set to `http://localhost:8080` in production

**Solution**: Update to your actual Cloud Run URL:

```bash
# Get your Cloud Run URL
API_URL=$(gcloud run services describe clockit-api --region europe-west4 --format 'value(status.url)')

# Update the environment variable
gcloud run services update clockit-api \
  --region europe-west4 \
  --update-env-vars="API_BASE_URL=${API_URL}"
```

**Example**:

```bash
gcloud run services update clockit-api \
  --region europe-west4 \
  --update-env-vars="API_BASE_URL=https://clockit-api-ie4o3wu3ta-ez.a.run.app"
```

---

## Files Created

- ✅ `clockit_api/Dockerfile` - API container config
- ✅ `clockit_api/.dockerignore` - API build ignore
- ✅ `clockit_api/.gcloudignore` - API deploy ignore
- ✅ `clockit-server/Dockerfile` - Socket container config
- ✅ `clockit-server/.dockerignore` - Socket build ignore
- ✅ `clockit-server/.gcloudignore` - Socket deploy ignore
- ✅ `cloudbuild-api.yaml` - API Cloud Build config
- ✅ `cloudbuild-socket.yaml` - Socket Cloud Build config

---

## Summary

✅ **Two Cloud Run services**: clockit-api + clockit-socket
✅ **Cost**: $0-5/month (both services free tier)
✅ **Fast**: ~1s cold starts
✅ **Scalable**: Auto-scales 0-10 instances
✅ **WebSocket support**: Session affinity enabled
✅ **Same GCP account**: Integrated with Firebase

🚀 **Deploy both services with Cloud Run!**
