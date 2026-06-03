# UPSC Official Notes Web

A web tool that fetches official-source content and converts it into UPSC-oriented notes with syllabus mapping. It can run locally for testing or be hosted online so you can use it from any browser.

## Sources wired in

- PIB RSS: latest Government of India press releases.
- data.gov.in: official Open Government Data resource APIs.
- MoSPI e-Sankhyiki: official statistics through the optional MoSPI Python client.
- RBI DBIE: economy, finance, inflation, and banking pages.
- UPSC: active exam pages, notifications, and related official links.

## Run locally

Preferred:

```powershell
cd "D:\RHIMagnesita_sahuni\OneDrive - RHI Magnesita GmbH\My Documents\UPSC\upsc-official-notes-app"
node server.js
```

PowerShell fallback:

```powershell
cd "D:\RHIMagnesita_sahuni\OneDrive - RHI Magnesita GmbH\My Documents\UPSC\upsc-official-notes-app"
powershell -NoProfile -ExecutionPolicy Bypass -File .\server.ps1
```

Open:

```text
http://127.0.0.1:8765
```

## Deploy online

See `DEPLOYMENT.md`. The easiest path is to host it as a Node web service on Render, Railway, Fly.io, Azure App Service, or any Docker-compatible host.

## Optional keys and packages

data.gov.in usually requires an API key for resource endpoints. You can paste it in the web page or set it before running:

```powershell
$env:DATAGOVIN_API_KEY="your-data-gov-in-key"
node server.js
```

For a hosted website, set `DATAGOVIN_API_KEY` as a cloud environment variable. To protect the public URL, also set:

```text
APP_ACCESS_KEY=your-private-passcode
```

MoSPI e-Sankhyiki publishes its official Python-client details on the connected MoSPI page:

https://www.mospi.gov.in/esankhyiki-python-library

## Notes

- The backend only accepts URLs from whitelisted official domains.
- Generated notes are extractive and rule-based, so verify sensitive numbers, dates, legal provisions, and scheme details from the official link.
- The app does not store your API key. It is sent only to the local backend for the current request.
