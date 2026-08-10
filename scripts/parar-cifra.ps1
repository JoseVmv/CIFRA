<#
  Encerra o servidor do CIFRA que estiver rodando em segundo plano.
  Os dados não são afetados: eles vivem em data\finance.sqlite.
#>
[CmdletBinding()]
param(
  # Sem -Silencioso, mostra uma caixinha confirmando o que aconteceu.
  [switch]$Silencioso
)

. (Join-Path $PSScriptRoot '_comum.ps1')

$parou = Stop-Cifra
$mensagem = if ($parou) {
  "CIFRA encerrado. Seus dados continuam salvos."
} else {
  "O CIFRA não estava rodando."
}

if ($Silencioso) {
  Write-Output $mensagem
} else {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($mensagem, 'CIFRA', 'OK', 'Information') | Out-Null
  } catch {
    Write-Output $mensagem
  }
}
