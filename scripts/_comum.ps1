# Funções compartilhadas pelos scripts do CIFRA (iniciar, parar, criar atalho).
# Este arquivo não faz nada sozinho: os outros scripts o carregam com ". _comum.ps1".

$ErrorActionPreference = 'Stop'

$Raiz = Split-Path -Parent $PSScriptRoot
$PastaLogs = Join-Path $Raiz 'logs'
$ArquivoPid = Join-Path $PastaLogs 'cifra.pid'

<#
  A porta segue a mesma ordem que o backend usa: variável de ambiente PORT,
  depois o .env da raiz, depois o padrão 4000. Assim o atalho continua certo
  se você mudar a porta em qualquer um dos dois lugares.
#>
function Get-PortaCifra {
  if ($env:PORT -match '^\d+$') { return [int]$env:PORT }

  $arquivoEnv = Join-Path $Raiz '.env'
  if (Test-Path -LiteralPath $arquivoEnv) {
    foreach ($linha in Get-Content -LiteralPath $arquivoEnv) {
      if ($linha -match '^\s*PORT\s*=\s*(\d+)\s*$') { return [int]$Matches[1] }
    }
  }
  return 4000
}

$Porta = Get-PortaCifra
$Url = "http://127.0.0.1:$Porta"

<# Servidor no ar? Um TCP connect em 127.0.0.1 responde na hora, sem proxy no caminho. #>
function Test-CifraNoAr {
  $cliente = New-Object System.Net.Sockets.TcpClient
  try {
    $cliente.Connect('127.0.0.1', $Porta)
    return $true
  } catch {
    return $false
  } finally {
    $cliente.Dispose()
  }
}

<#
  Diz se quem está na porta NÃO é o servidor compilado que o atalho sobe —
  tipicamente o `npm run dev`, que roda `src/server.ts` pelo tsx. Nesse caso o
  atalho não encosta no processo: só abre o navegador.
#>
function Test-ServidorDeTerceiro {
  try {
    $conexoes = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
    foreach ($conexao in $conexoes) {
      $processo = Get-CimInstance Win32_Process -Filter "ProcessId=$($conexao.OwningProcess)" -ErrorAction SilentlyContinue
      if ($processo -and $processo.CommandLine -notmatch 'dist[\\/]server\.js') {
        return $true
      }
    }
  } catch {
    # Sem CIM disponível preferimos não adivinhar: tratamos como servidor nosso.
  }
  return $false
}

<#
  Encerra o servidor. Tenta primeiro o PID que o iniciador anotou; se ele não
  valer mais (máquina reiniciada, processo trocado), cai para quem estiver
  ouvindo na porta. Só mata processos "node" — nunca outra coisa.
#>
function Stop-Cifra {
  $parou = $false

  if (Test-Path -LiteralPath $ArquivoPid) {
    $anotado = (Get-Content -LiteralPath $ArquivoPid | Select-Object -First 1)
    if ($anotado -match '^\d+$') {
      $processo = Get-Process -Id ([int]$anotado) -ErrorAction SilentlyContinue
      if ($processo -and $processo.ProcessName -eq 'node') {
        Stop-Process -Id $processo.Id -Force -ErrorAction SilentlyContinue
        $parou = $true
      }
    }
    Remove-Item -LiteralPath $ArquivoPid -Force -ErrorAction SilentlyContinue
  }

  try {
    $conexoes = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
    foreach ($conexao in $conexoes) {
      $processo = Get-Process -Id $conexao.OwningProcess -ErrorAction SilentlyContinue
      if ($processo -and $processo.ProcessName -eq 'node') {
        Stop-Process -Id $processo.Id -Force -ErrorAction SilentlyContinue
        $parou = $true
      }
    }
  } catch {
    # Get-NetTCPConnection pode não existir em edições antigas do Windows.
  }

  return $parou
}
