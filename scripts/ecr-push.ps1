# Build y push de la imagen Docker a ECR.
# Uso (desde la raíz del repo):
#   .\scripts\ecr-push.ps1

param(
  [string]$Region = "sa-east-1",
  [string]$Repository = "chat-whatsapp-ai",
  [string]$AccountId = "024848463506",
  [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$registry = "$AccountId.dkr.ecr.$Region.amazonaws.com"
$imageUri = "$registry/${Repository}:$Tag"

Write-Host "Login ECR: $registry"
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry
if ($LASTEXITCODE -ne 0) { throw "Fallo login ECR" }

Write-Host "Build: chat-whatsapp-ai"
docker build -t chat-whatsapp-ai .
if ($LASTEXITCODE -ne 0) { throw "Fallo docker build" }

Write-Host "Tag: $imageUri"
docker tag "chat-whatsapp-ai:$Tag" $imageUri

Write-Host "Push: $imageUri"
docker push $imageUri
if ($LASTEXITCODE -ne 0) { throw "Fallo docker push" }

Write-Host ""
Write-Host "Listo. Usa esta imagen en ECS:"
Write-Host "  $imageUri"
