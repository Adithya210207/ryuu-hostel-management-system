param([string]$LaptopAddress = '192.168.0.107')
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open PowerShell using Run as administrator, then run this script again.'
}
if ($LaptopAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Use the laptop local Wi-Fi IPv4 address.' }
$network = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LaptopAddress
$nodePath = (Get-Command node.exe).Source
$ruleName = "Ryuu phone preview $LaptopAddress"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4174 -RemoteAddress LocalSubnet -LocalAddress $LaptopAddress -InterfaceAlias $network.InterfaceAlias -Program $nodePath -Profile Any | Out-Null
}
Write-Host "Phone preview allowed from the local Wi-Fi subnet: http://${LaptopAddress}:4174"
Write-Host 'Keep the preview running and the laptop awake. No router port forwarding is needed.'
