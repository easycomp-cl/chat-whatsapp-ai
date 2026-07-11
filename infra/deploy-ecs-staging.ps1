# Despliega backend staging en ECS Fargate (piloto combinado API + workers).
# Requiere: AWS CLI, imagen en ECR, secreto chat-whatsapp-ai/staging en Secrets Manager.
#
# Uso:
#   .\infra\deploy-ecs-staging.ps1
#   .\infra\deploy-ecs-staging.ps1 -SkipIam   # si el rol ya existe

param(
  [string]$Region = "sa-east-1",
  [string]$AccountId = "024848463506",
  [string]$ClusterName = "easycomp-staging",
  [string]$ServiceName = "chat-whatsapp-ai-combined",
  [string]$SecretArn = "arn:aws:secretsmanager:sa-east-1:024848463506:secret:chat-whatsapp-ai/staging-FD26yQ",
  [string]$ImageUri = "024848463506.dkr.ecr.sa-east-1.amazonaws.com/chat-whatsapp-ai:latest",
  [switch]$SkipIam
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Require-Ok([string]$Step) {
  if ($LASTEXITCODE -ne 0) { throw "Fallo: $Step" }
}

Write-Host "=== 1/8 Red (VPC) ===" -ForegroundColor Cyan
$vpcId = aws ec2 describe-vpcs --region $Region --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
if (-not $vpcId -or $vpcId -eq "None") {
  Write-Host "Creando VPC default..."
  $vpcId = (aws ec2 create-default-vpc --region $Region | ConvertFrom-Json).Vpc.VpcId
  Start-Sleep -Seconds 5
}
Write-Host "VPC: $vpcId"

$subnets = aws ec2 describe-subnets --region $Region --filters "Name=vpc-id,Values=$vpcId" "Name=default-for-az,Values=true" --query "Subnets[*].SubnetId" --output text
$subnetList = $subnets -split "\s+" | Where-Object { $_ }
if ($subnetList.Count -lt 2) { throw "Se necesitan al menos 2 subnets publicas" }
$subnetA = $subnetList[0]
$subnetB = $subnetList[1]
Write-Host "Subnets: $subnetA, $subnetB"

if (-not $SkipIam) {
  Write-Host "=== 2/8 Rol IAM ecsTaskExecutionRole ===" -ForegroundColor Cyan
  $roleExists = $true
  try {
    aws iam get-role --role-name ecsTaskExecutionRole | Out-Null
    if ($LASTEXITCODE -ne 0) { $roleExists = $false }
  } catch { $roleExists = $false }

  if (-not $roleExists) {
    $trustFile = ($root + "/infra/trust-policy-ecs-tasks.json") -replace '\\', '/'
    $secretsFile = ($root + "/infra/secrets-policy.json") -replace '\\', '/'
    & aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document "file://$trustFile"
    if ($LASTEXITCODE -ne 0) { throw "Fallo: iam create-role" }
    & aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    if ($LASTEXITCODE -ne 0) { throw "Fallo: iam attach-role-policy" }
    & aws iam put-role-policy --role-name ecsTaskExecutionRole --policy-name ReadStagingSecrets --policy-document "file://$secretsFile"
    if ($LASTEXITCODE -ne 0) { throw "Fallo: iam put-role-policy" }
    Write-Host "Rol creado. Esperando propagacion IAM (10s)..."
    Start-Sleep -Seconds 10
  } else {
    Write-Host "Rol ecsTaskExecutionRole ya existe"
  }
}

Write-Host "=== 3/8 Log group ===" -ForegroundColor Cyan
try {
  aws logs create-log-group --log-group-name /ecs/chat-whatsapp-ai --region $Region 2>$null | Out-Null
} catch { }

Write-Host "=== 4/8 Security groups ===" -ForegroundColor Cyan
$albSg = aws ec2 describe-security-groups --region $Region --filters "Name=group-name,Values=easycomp-alb-sg" "Name=vpc-id,Values=$vpcId" --query "SecurityGroups[0].GroupId" --output text
if (-not $albSg -or $albSg -eq "None") {
  $albSg = aws ec2 create-security-group --group-name easycomp-alb-sg --description "ALB staging EasyComp" --vpc-id $vpcId --region $Region --query GroupId --output text
  aws ec2 authorize-security-group-ingress --group-id $albSg --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $Region | Out-Null
  aws ec2 authorize-security-group-ingress --group-id $albSg --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $Region | Out-Null
}
Write-Host "ALB SG: $albSg"

$ecsSg = aws ec2 describe-security-groups --region $Region --filters "Name=group-name,Values=easycomp-ecs-sg" "Name=vpc-id,Values=$vpcId" --query "SecurityGroups[0].GroupId" --output text
if (-not $ecsSg -or $ecsSg -eq "None") {
  $ecsSg = aws ec2 create-security-group --group-name easycomp-ecs-sg --description "ECS tasks staging EasyComp" --vpc-id $vpcId --region $Region --query GroupId --output text
  aws ec2 authorize-security-group-ingress --group-id $ecsSg --protocol tcp --port 3000 --source-group $albSg --region $Region | Out-Null
}
Write-Host "ECS SG: $ecsSg"

Write-Host "=== 5/8 ALB + Target Group ===" -ForegroundColor Cyan
$tgArn = aws elbv2 describe-target-groups --region $Region --names easycomp-api-tg --query "TargetGroups[0].TargetGroupArn" --output text 2>$null
if (-not $tgArn -or $tgArn -eq "None") {
  $tgArn = aws elbv2 create-target-group `
    --name easycomp-api-tg `
    --protocol HTTP `
    --port 3000 `
    --vpc-id $vpcId `
    --target-type ip `
    --health-check-path /health `
    --health-check-interval-seconds 30 `
    --region $Region `
    --query TargetGroups[0].TargetGroupArn --output text
  Require-Ok "create-target-group"
}
Write-Host "Target group: $tgArn"

$albArn = aws elbv2 describe-load-balancers --region $Region --names easycomp-api-staging --query "LoadBalancers[0].LoadBalancerArn" --output text 2>$null
$albDns = $null
if (-not $albArn -or $albArn -eq "None") {
  $albJson = aws elbv2 create-load-balancer `
    --name easycomp-api-staging `
    --subnets $subnetA $subnetB `
    --security-groups $albSg `
    --scheme internet-facing `
    --type application `
    --region $Region | ConvertFrom-Json
  $albArn = $albJson.LoadBalancers[0].LoadBalancerArn
  $albDns = $albJson.LoadBalancers[0].DNSName
} else {
  $albDns = aws elbv2 describe-load-balancers --region $Region --load-balancer-arns $albArn --query "LoadBalancers[0].DNSName" --output text
}
Write-Host "ALB DNS: $albDns"

$listenerExists = aws elbv2 describe-listeners --load-balancer-arn $albArn --region $Region --query "Listeners[?Port==\`"80\`"].ListenerArn" --output text
if (-not $listenerExists) {
  aws elbv2 create-listener `
    --load-balancer-arn $albArn `
    --protocol HTTP `
    --port 80 `
    --default-actions "Type=forward,TargetGroupArn=$tgArn" `
    --region $Region | Out-Null
  Write-Host "Listener HTTP:80 creado (HTTPS cuando tengas certificado ACM)"
}

Write-Host "=== 6/8 Cluster ECS ===" -ForegroundColor Cyan
$clusters = aws ecs list-clusters --region $Region --query "clusterArns" --output text
  if ($clusters -notmatch [regex]::Escape($ClusterName)) {
    aws ecs create-cluster --cluster-name $ClusterName --region $Region | Out-Null
    Require-Ok "create-cluster"
  }
Write-Host "Cluster: $ClusterName"

Write-Host "=== 7/8 Task definition ===" -ForegroundColor Cyan
$taskDefFile = ($root + "/infra/ecs-task-definition.staging.json") -replace '\\', '/'
$taskDefArn = aws ecs register-task-definition --cli-input-json "file://$taskDefFile" --region $Region --query "taskDefinition.taskDefinitionArn" --output text
Require-Ok "register-task-definition"
Write-Host "Task definition: $taskDefArn"

Write-Host "=== 8/8 Servicio ECS ===" -ForegroundColor Cyan
$svcStatus = aws ecs describe-services --cluster $ClusterName --services $ServiceName --region $Region --query "services[0].status" --output text 2>$null
if (-not $svcStatus -or $svcStatus -eq "None" -or $svcStatus -eq "INACTIVE") {
  aws ecs create-service `
    --cluster $ClusterName `
    --service-name $ServiceName `
    --task-definition $taskDefArn `
    --desired-count 1 `
    --launch-type FARGATE `
    --network-configuration "awsvpcConfiguration={subnets=[$subnetA,$subnetB],securityGroups=[$ecsSg],assignPublicIp=ENABLED}" `
    --load-balancers "targetGroupArn=$tgArn,containerName=api,containerPort=3000" `
    --health-check-grace-period-seconds 120 `
    --region $Region | Out-Null
  Require-Ok "create-service"
  Write-Host "Servicio creado. Esperando arranque (60s)..."
  Start-Sleep -Seconds 60
} else {
  aws ecs update-service --cluster $ClusterName --service $ServiceName --task-definition $taskDefArn --force-new-deployment --region $Region | Out-Null
  Require-Ok "update-service"
  Write-Host "Servicio actualizado"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "DESPLIEGUE INICIADO"
Write-Host "========================================"
Write-Host "Probar health (HTTP por ahora):"
Write-Host "  curl http://$albDns/health"
Write-Host ""
Write-Host "Cuando tengas certificado ACM, apunta DNS:"
Write-Host "  CNAME api.conversai -> $albDns"
Write-Host ""
Write-Host "Logs: CloudWatch -> /ecs/chat-whatsapp-ai"
Write-Host "Consola: ECS -> $ClusterName -> $ServiceName"
