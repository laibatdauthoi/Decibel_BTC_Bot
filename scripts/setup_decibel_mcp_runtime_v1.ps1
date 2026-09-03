$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:LOCALAPPDATA 'DecibelTools\decibel-mcp-runtime'
$Cache = Join-Path $env:LOCALAPPDATA 'DecibelTools\npm-cache'
$Node = Join-Path $env:LOCALAPPDATA 'DecibelTools\node-v22.23.2-win-x64\node.exe'
$Npm = Join-Path (Split-Path $Node) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $Node)) { throw 'MCP_PINNED_NODE_MISSING' }
$env:PATH = "$(Split-Path $Node);$env:PATH"
New-Item -ItemType Directory -Force -Path $Root, $Cache | Out-Null
& $Node $Npm install --prefix $Root --cache $Cache --save-exact '@decibeltrade/cli@0.1.2'
if ($LASTEXITCODE -ne 0) { throw 'MCP_PINNED_PACKAGE_INSTALL_FAILED' }
$PackageJsonPath = Join-Path $Root 'node_modules\@decibeltrade\cli\package.json'
$Package = Get-Content -Raw -LiteralPath $PackageJsonPath | ConvertFrom-Json
if ($Package.version -ne '0.1.2') { throw 'MCP_PINNED_PACKAGE_VERSION_MISMATCH' }
$Bin = $Package.bin.'decibel-mcp'
if (-not $Bin) { throw 'MCP_PINNED_ENTRYPOINT_MISSING' }
$Entrypoint = [IO.Path]::GetFullPath((Join-Path (Split-Path $PackageJsonPath) $Bin))
if (-not (Test-Path -LiteralPath $Entrypoint)) { throw 'MCP_PINNED_ENTRYPOINT_MISSING' }
$Metadata = [ordered]@{
  packageName = '@decibeltrade/cli'; packageVersion = '0.1.2'; nodeExecutable = $Node
  entrypoint = $Entrypoint
  packageJsonSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PackageJsonPath).Hash.ToLowerInvariant()
  entrypointSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Entrypoint).Hash.ToLowerInvariant()
  installedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$MetadataPath = Join-Path $Root 'decibel-mcp-runtime-v1.json'
[IO.File]::WriteAllText($MetadataPath, ($Metadata | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Write-Output "DECIBEL_MCP_NODE_EXECUTABLE=$Node"
Write-Output "DECIBEL_MCP_ENTRYPOINT=$Entrypoint"
Write-Output "DECIBEL_MCP_RUNTIME_METADATA=$MetadataPath"
