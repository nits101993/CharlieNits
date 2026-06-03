param(
    [int]$Port = $(if ($env:UPSC_NOTES_PORT) { [int]$env:UPSC_NOTES_PORT } else { 8765 })
)

Add-Type -AssemblyName System.Web

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Join-Path $Root "web"

$OfficialDomains = @(
    "pib.gov.in",
    "www.pib.gov.in",
    "data.gov.in",
    "www.data.gov.in",
    "api.data.gov.in",
    "mospi.gov.in",
    "www.mospi.gov.in",
    "api.mospi.gov.in",
    "rbi.org.in",
    "www.rbi.org.in",
    "data.rbi.org.in",
    "dbieold.rbi.org.in",
    "upsc.gov.in",
    "www.upsc.gov.in",
    "india.gov.in",
    "www.india.gov.in"
)

$Sources = @(
    @{
        id = "pib"
        name = "PIB"
        url = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1"
        purpose = "Latest Government of India press releases"
    },
    @{
        id = "data-gov"
        name = "data.gov.in"
        url = "https://api.data.gov.in/resource/"
        purpose = "Open Government Data resource APIs"
    },
    @{
        id = "mospi"
        name = "MoSPI e-Sankhyiki"
        url = "https://www.mospi.gov.in/esankhyiki-python-library"
        purpose = "Official statistics through the MoSPI e-Sankhyiki page and client"
    },
    @{
        id = "rbi"
        name = "RBI DBIE"
        url = "https://dbieold.rbi.org.in/DBIE/"
        purpose = "Database on Indian Economy pages and releases"
    },
    @{
        id = "upsc"
        name = "UPSC"
        url = "https://upsc.gov.in/examinations/active-exams"
        purpose = "Official exam notifications, syllabus pages, and papers"
    }
)

function ConvertTo-CleanText {
    param([string]$Text)
    if (-not $Text) { return "" }
    $value = [System.Net.WebUtility]::HtmlDecode($Text)
    $value = $value -replace '<!\[CDATA\[(?s:(.*?))\]\]>', '$1'
    $value = $value -replace "[`t`r`f`v ]+", " "
    $value = $value -replace "(`n\s*){3,}", "`n`n"
    return $value.Trim()
}

function Assert-OfficialUrl {
    param([string]$Url)
    try {
        $uri = [Uri]$Url
    } catch {
        throw "Invalid URL."
    }
    if ($uri.Scheme -notin @("http", "https")) {
        throw "Only HTTP/HTTPS official URLs are supported."
    }
    if ($OfficialDomains -notcontains $uri.Host.ToLowerInvariant()) {
        throw "Domain is not whitelisted as an official source: $($uri.Host)"
    }
    return $uri.AbsoluteUri
}

function Invoke-OfficialWebRequest {
    param([string]$Url)
    $safeUrl = Assert-OfficialUrl $Url
    $headers = @{
        "User-Agent" = "UPSCOfficialNotes/1.0 (+local web study tool)"
        "Accept" = "text/html,application/xhtml+xml,application/xml,application/json,text/plain,*/*"
    }
    return Invoke-WebRequest -Uri $safeUrl -UseBasicParsing -TimeoutSec 30 -Headers $headers
}

function Remove-Html {
    param([string]$Html)
    if (-not $Html) { return "" }
    $value = [regex]::Replace($Html, "(?is)<script\b.*?</script>", " ")
    $value = [regex]::Replace($value, "(?is)<style\b.*?</style>", " ")
    $value = [regex]::Replace($value, "(?is)<noscript\b.*?</noscript>", " ")
    $value = [regex]::Replace($value, "(?i)</(?:p|div|li|tr|h1|h2|h3|h4|section|article)>", "`n")
    $value = [regex]::Replace($value, "(?i)<br\s*/?>", "`n")
    $value = [regex]::Replace($value, "(?s)<[^>]+>", " ")
    return ConvertTo-CleanText $value
}

function Get-HtmlTitle {
    param([string]$Html)
    $match = [regex]::Match($Html, "(?is)<title[^>]*>(.*?)</title>")
    if ($match.Success) {
        return Remove-Html $match.Groups[1].Value
    }
    return ""
}

function Get-OfficialLinks {
    param(
        [string]$BaseUrl,
        [string]$Html
    )
    $items = New-Object System.Collections.ArrayList
    $seen = @{}
    $pattern = "(?is)<a\b[^>]*href\s*=\s*(?:""([^""]+)""|'([^']+)'|([^\s>]+))[^>]*>(.*?)</a>"
    foreach ($match in [regex]::Matches($Html, $pattern)) {
        $href = $match.Groups[1].Value
        if (-not $href) { $href = $match.Groups[2].Value }
        if (-not $href) { $href = $match.Groups[3].Value }
        if (-not $href -or $href -match "^(javascript:|mailto:|#)") { continue }
        try {
            $absolute = ([Uri]::new([Uri]$BaseUrl, $href)).AbsoluteUri
            $absolute = Assert-OfficialUrl $absolute
        } catch {
            continue
        }
        if ($seen.ContainsKey($absolute)) { continue }
        $seen[$absolute] = $true
        $title = Remove-Html $match.Groups[4].Value
        if (-not $title) { $title = $absolute }
        [void]$items.Add(@{
            title = $title
            url = $absolute
        })
        if ($items.Count -ge 100) { break }
    }
    return @($items)
}

function Get-ExtractedPage {
    param([string]$Url)
    $response = Invoke-OfficialWebRequest $Url
    $content = [string]$response.Content
    $contentType = ""
    if ($response.Headers["Content-Type"]) {
        $contentType = [string]$response.Headers["Content-Type"]
    }
    if ($contentType -match "application/json" -or $content.TrimStart().StartsWith("{") -or $content.TrimStart().StartsWith("[")) {
        $parsed = $content | ConvertFrom-Json
        return @{
            title = $Url
            url = (Assert-OfficialUrl $Url)
            content_type = $contentType
            text = ($parsed | ConvertTo-Json -Depth 40)
            links = @()
        }
    }
    $safeUrl = Assert-OfficialUrl $Url
    return @{
        title = (Get-HtmlTitle $content)
        url = $safeUrl
        content_type = $contentType
        text = (Remove-Html $content)
        links = (Get-OfficialLinks -BaseUrl $safeUrl -Html $content)
    }
}

function Get-PibItems {
    param([int]$Limit = 25)
    $rssUrl = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1"
    $response = Invoke-OfficialWebRequest $rssUrl
    [xml]$xml = [string]$response.Content
    $items = @()
    foreach ($item in $xml.rss.channel.item | Select-Object -First $Limit) {
        $items += @{
            title = (ConvertTo-CleanText ([string]$item.title))
            url = (ConvertTo-CleanText ([string]$item.link))
            date = (ConvertTo-CleanText ([string]$item.pubDate))
            summary = (ConvertTo-CleanText ([string]$item.description))
            source = "PIB"
        }
    }
    if ($items.Count -eq 0) {
        $fallbackUrl = "https://www.pib.gov.in/allRel.aspx?lang=1&reg=3"
        $page = Get-ExtractedPage $fallbackUrl
        $fallbackItems = @($page.links | Where-Object { $_.url -match "PressReleasePage\.aspx|PressReleseDetail\.aspx|PRID=" } | Select-Object -First $Limit)
        foreach ($item in $fallbackItems) {
            $item.source = "PIB"
            $item.summary = "PIB All Releases fallback"
        }
        return @{
            source = "PIB"
            url = $fallbackUrl
            items = $fallbackItems
        }
    }
    return @{
        source = "PIB"
        url = $rssUrl
        items = $items
    }
}

function Get-UpscActive {
    $url = "https://upsc.gov.in/examinations/active-exams"
    $page = Get-ExtractedPage $url
    $items = @($page.links | Where-Object { $_.title -match "civil|services|examination|notification|syllabus|notice" } | Select-Object -First 60)
    foreach ($item in $items) { $item.source = "UPSC" }
    return @{
        source = "UPSC"
        url = $url
        title = $page.title
        text = $page.text.Substring(0, [Math]::Min(10000, $page.text.Length))
        items = $items
    }
}

function Get-RbiDbie {
    $url = "https://dbieold.rbi.org.in/DBIE/"
    $page = Get-ExtractedPage $url
    $items = @($page.links | Where-Object { $_.title -match "statistics|bulletin|handbook|data|report|publication|time-series|series" } | Select-Object -First 60)
    foreach ($item in $items) { $item.source = "RBI DBIE" }
    return @{
        source = "RBI DBIE"
        url = $url
        title = $page.title
        text = $page.text.Substring(0, [Math]::Min(14000, $page.text.Length))
        items = $items
    }
}

function Get-MospiPage {
    $url = "https://www.mospi.gov.in/esankhyiki-python-library"
    $page = Get-ExtractedPage $url
    $items = @($page.links | Select-Object -First 60)
    foreach ($item in $items) { $item.source = "MoSPI" }
    return @{
        source = "MoSPI e-Sankhyiki"
        url = $url
        title = $(if ($page.title) { $page.title } else { "MoSPI e-Sankhyiki" })
        text = $(if ($page.text) { $page.text } else { "MoSPI e-Sankhyiki official page for statistics access." })
        items = $items
    }
}

function Get-DataGovResource {
    param($Params)
    $resourceId = [string]$Params["resource_id"]
    $apiKey = [string]$Params["api_key"]
    if (-not $apiKey) { $apiKey = $env:DATAGOVIN_API_KEY }
    $limit = 10
    if ($Params["limit"]) { $limit = [Math]::Min(100, [Math]::Max(1, [int]$Params["limit"])) }
    $offset = 0
    if ($Params["offset"]) { $offset = [Math]::Max(0, [int]$Params["offset"]) }
    if (-not $resourceId) { throw "A data.gov.in resource_id is required." }
    if (-not $apiKey) { throw "A data.gov.in API key is required. You can paste it in the web page or set DATAGOVIN_API_KEY." }

    $queryParts = New-Object System.Collections.ArrayList
    [void]$queryParts.Add("api-key=$([Uri]::EscapeDataString($apiKey))")
    [void]$queryParts.Add("format=json")
    [void]$queryParts.Add("offset=$offset")
    [void]$queryParts.Add("limit=$limit")
    foreach ($key in $Params.Keys) {
        if ($key -like "filters[*" -or $key -in @("fields", "sort")) {
            [void]$queryParts.Add("$([Uri]::EscapeDataString($key))=$([Uri]::EscapeDataString([string]$Params[$key]))")
        }
    }
    $url = "https://api.data.gov.in/resource/$([Uri]::EscapeDataString($resourceId))?$($queryParts -join '&')"
    $response = Invoke-OfficialWebRequest $url
    $parsed = ([string]$response.Content) | ConvertFrom-Json
    $fields = @()
    if ($parsed.field) {
        foreach ($field in $parsed.field) {
            if ($field.name) { $fields += $field.name }
            elseif ($field.id) { $fields += $field.id }
        }
    }
    $title = "data.gov.in resource"
    if ($parsed.title) { $title = $parsed.title }
    elseif ($parsed.org -and $parsed.org[0].org) { $title = $parsed.org[0].org }
    $records = @($parsed.records)
    return @{
        source = "data.gov.in"
        url = ($url -replace [regex]::Escape($apiKey), "API_KEY")
        title = $title
        total = $parsed.total
        count = $parsed.count
        fields = $fields
        records = $records
        text = (@{
            title = $title
            total = $parsed.total
            count = $parsed.count
            fields = $fields
            records = $records
        } | ConvertTo-Json -Depth 40)
    }
}

function Send-Json {
    param(
        $Context,
        $Payload,
        [int]$Status = 200
    )
    $json = $Payload | ConvertTo-Json -Depth 50
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = "application/json; charset=utf-8"
    $Context.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $Context.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $Context.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}

function Send-StaticFile {
    param($Context, [string]$PathPart)
    if (-not $PathPart -or $PathPart -eq "/") {
        $filePath = Join-Path $WebRoot "index.html"
    } else {
        $relative = $PathPart.TrimStart("/")
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $relative))
    }
    $webFull = [System.IO.Path]::GetFullPath($WebRoot)
    if (-not $filePath.StartsWith($webFull)) {
        throw "Forbidden."
    }
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $Context.Response.StatusCode = 404
        $Context.Response.Close()
        return
    }
    $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
    $contentType = switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".css" { "text/css; charset=utf-8" }
        ".js" { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png" { "image/png" }
        ".svg" { "image/svg+xml" }
        default { "application/octet-stream" }
    }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = $contentType
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Context.Response.OutputStream.Close()
}

function Get-Params {
    param($Request)
    $query = [System.Web.HttpUtility]::ParseQueryString($Request.Url.Query)
    $params = @{}
    foreach ($key in $query.AllKeys) {
        if ($key) { $params[$key] = $query[$key] }
    }
    return $params
}

function Handle-ApiGet {
    param($Path, $Params)
    switch ($Path) {
        "/api/health" { return @{ ok = $true; sources = $Sources } }
        "/api/sources" { return @{ sources = $Sources; official_domains = $OfficialDomains } }
        "/api/pib" {
            $limit = 25
            if ($Params["limit"]) { $limit = [Math]::Min(50, [Math]::Max(1, [int]$Params["limit"])) }
            return Get-PibItems -Limit $limit
        }
        "/api/upsc" { return Get-UpscActive }
        "/api/rbi" { return Get-RbiDbie }
        "/api/mospi/datasets" { return Get-MospiPage }
        "/api/data-gov" { return Get-DataGovResource -Params $Params }
        "/api/url" {
            if (-not $Params["url"]) { throw "url is required." }
            return Get-ExtractedPage ([string]$Params["url"])
        }
        default { throw "API endpoint not found." }
    }
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "UPSC Official Notes web app running at $prefix"
    Write-Host "Press Ctrl+C to stop."
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $request = $context.Request
            if ($request.HttpMethod -eq "OPTIONS") {
                Send-Json -Context $context -Payload @{} -Status 204
                continue
            }
            if ($request.Url.AbsolutePath.StartsWith("/api/")) {
                if ($request.HttpMethod -ne "GET") {
                    Send-Json -Context $context -Payload @{ error = "Method not allowed." } -Status 405
                    continue
                }
                $params = Get-Params $request
                $payload = Handle-ApiGet -Path $request.Url.AbsolutePath -Params $params
                Send-Json -Context $context -Payload $payload
            } else {
                Send-StaticFile -Context $context -PathPart $request.Url.AbsolutePath
            }
        } catch {
            Send-Json -Context $context -Payload @{ error = $_.Exception.Message } -Status 500
        }
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
}
