<#
  Abre o CIFRA em um clique.

  O que ele faz, nessa ordem:
    1. se o servidor já está no ar e o build está em dia, só abre o navegador;
    2. se o código mudou desde o último build, recompila (e reinicia o servidor);
    3. sobe o backend em segundo plano, sem janela de terminal;
    4. espera a porta responder e abre o app no navegador.

  Uso normal: pelo atalho na área de trabalho. Pela linha de comando:
    powershell -ExecutionPolicy Bypass -File scripts\iniciar-cifra.ps1 [-Janela app]
#>
[CmdletBinding()]
param(
  # 'aba' abre no navegador padrão; 'app' abre uma janela sem barra de endereço.
  [ValidateSet('aba', 'app')]
  [string]$Janela = 'aba',

  # Sobe o servidor e para por aí, sem abrir o navegador (útil para testes).
  [switch]$SemNavegador
)

. (Join-Path $PSScriptRoot '_comum.ps1')

New-Item -ItemType Directory -Force -Path $PastaLogs | Out-Null

# ---------------------------------------------------------------- aviso visual

$script:Splash = $null
$script:SplashTexto = $null

<# Um cartãozinho no centro da tela, só quando há espera de verdade (build). #>
function Show-Splash([string]$mensagem) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing

    if ($null -eq $script:Splash) {
      $form = New-Object System.Windows.Forms.Form
      $form.FormBorderStyle = 'None'
      $form.StartPosition = 'CenterScreen'
      $form.Size = New-Object System.Drawing.Size(380, 120)
      $form.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#16161A')
      $form.TopMost = $true
      $form.ShowInTaskbar = $false

      $titulo = New-Object System.Windows.Forms.Label
      $titulo.Text = 'CIFRA'
      $titulo.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#12A150')
      $titulo.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
      $titulo.AutoSize = $false
      $titulo.TextAlign = 'MiddleCenter'
      $titulo.Dock = 'Top'
      $titulo.Height = 52

      $texto = New-Object System.Windows.Forms.Label
      $texto.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#D6D6D3')
      $texto.Font = New-Object System.Drawing.Font('Segoe UI', 9.5)
      $texto.AutoSize = $false
      $texto.TextAlign = 'TopCenter'
      $texto.Dock = 'Fill'

      $form.Controls.Add($texto)
      $form.Controls.Add($titulo)
      $form.Show()

      $script:Splash = $form
      $script:SplashTexto = $texto
    }

    $script:SplashTexto.Text = $mensagem
    [System.Windows.Forms.Application]::DoEvents()
  } catch {
    # Sem interface gráfica disponível: seguimos em silêncio.
  }
}

<# Mantém o cartão respondendo enquanto esperamos algo demorado. #>
function Update-Splash {
  try {
    if ($script:Splash) { [System.Windows.Forms.Application]::DoEvents() }
  } catch { }
}

function Close-Splash {
  try {
    if ($script:Splash) {
      $script:Splash.Close()
      $script:Splash.Dispose()
      $script:Splash = $null
    }
  } catch { }
}

<# Registra em log sempre; a caixa de mensagem só quando há alguém olhando. #>
function Show-Erro([string]$mensagem) {
  try {
    $registro = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $mensagem
    Add-Content -LiteralPath (Join-Path $PastaLogs 'erro.log') -Value $registro -Encoding UTF8
  } catch { }

  if ($SemNavegador) { return }

  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($mensagem, 'CIFRA', 'OK', 'Error') | Out-Null
  } catch { }
}

# ------------------------------------------------------- build está em dia?

function Get-DataMaisRecente([string[]]$caminhos) {
  $maisRecente = [datetime]::MinValue
  foreach ($caminho in $caminhos) {
    if (-not (Test-Path -LiteralPath $caminho)) { continue }
    $itens = Get-ChildItem -LiteralPath $caminho -Recurse -File -Force -ErrorAction SilentlyContinue
    foreach ($item in $itens) {
      if ($item.LastWriteTimeUtc -gt $maisRecente) { $maisRecente = $item.LastWriteTimeUtc }
    }
  }
  return $maisRecente
}

<#
  Compara o arquivo-fonte mais novo com o build mais antigo dos dois lados.
  Se você mexeu no código depois de compilar, o atalho recompila sozinho.
#>
function Test-BuildDesatualizado {
  $servidorCompilado = Join-Path $Raiz 'backend\dist\server.js'
  $paginaCompilada = Join-Path $Raiz 'frontend\dist\index.html'
  if (-not (Test-Path -LiteralPath $servidorCompilado)) { return $true }
  if (-not (Test-Path -LiteralPath $paginaCompilada)) { return $true }

  $fontes = @(
    (Join-Path $Raiz 'backend\src'),
    (Join-Path $Raiz 'frontend\src'),
    (Join-Path $Raiz 'frontend\index.html'),
    (Join-Path $Raiz 'frontend\vite.config.ts'),
    (Join-Path $Raiz 'package.json'),
    (Join-Path $Raiz 'backend\package.json'),
    (Join-Path $Raiz 'frontend\package.json')
  )

  $fonteMaisNova = Get-DataMaisRecente $fontes
  $buildApi = Get-DataMaisRecente @((Join-Path $Raiz 'backend\dist'))
  $buildWeb = Get-DataMaisRecente @((Join-Path $Raiz 'frontend\dist'))
  $buildMaisAntigo = if ($buildApi -lt $buildWeb) { $buildApi } else { $buildWeb }

  return $fonteMaisNova -gt $buildMaisAntigo
}

<#
  O servidor no ar é anterior ao build?

  O frontend é lido do disco a cada pedido, então uma recompilação já aparece na
  tela sem reiniciar nada — mas a API vive na memória do processo. Com um
  servidor antigo no ar, a interface nova chama rotas que aquele processo não
  conhece e a resposta é "Rota não encontrada". Comparar o build do backend com
  a hora em que o processo subiu é o que fecha esse buraco.
#>
function Test-ServidorAntigo {
  $subiuEm = Get-InicioDoServidor
  if ($null -eq $subiuEm) { return $false }

  return (Get-DataMaisRecente @((Join-Path $Raiz 'backend\dist'))) -gt $subiuEm
}

# ------------------------------------------------------------------- ações

<#
  Roda npm sem janela e sem travar o cartão de aviso.

  Usamos Process.Start em vez de Start-Process porque só assim guardamos o
  handle do processo — Start-Process -PassThru sem -Wait devolve ExitCode nulo,
  e um build que deu certo passaria por falha.
#>
function Invoke-Npm([string]$argumentos, [string]$nomeDoLog) {
  $inicio = New-Object System.Diagnostics.ProcessStartInfo
  $inicio.FileName = $env:ComSpec
  $inicio.Arguments = "/c npm $argumentos"
  $inicio.WorkingDirectory = $Raiz
  $inicio.UseShellExecute = $false
  $inicio.CreateNoWindow = $true
  $inicio.RedirectStandardOutput = $true
  $inicio.RedirectStandardError = $true

  $processo = [System.Diagnostics.Process]::Start($inicio)

  # Os dois canais são lidos em paralelo: se o buffer de um pipe enchesse, o npm travaria.
  $saida = $processo.StandardOutput.ReadToEndAsync()
  $erros = $processo.StandardError.ReadToEndAsync()

  while (-not $processo.HasExited) {
    Update-Splash
    Start-Sleep -Milliseconds 150
  }
  $processo.WaitForExit()

  $codigo = $processo.ExitCode
  [System.IO.File]::WriteAllText((Join-Path $PastaLogs "$nomeDoLog-out.log"), $saida.Result)
  [System.IO.File]::WriteAllText((Join-Path $PastaLogs "$nomeDoLog-erro.log"), $erros.Result)
  $processo.Dispose()

  if ($codigo -ne 0) {
    throw "O comando 'npm $argumentos' falhou (código $codigo).`n`nDetalhes em logs\$nomeDoLog-erro.log"
  }
}

function Start-Servidor {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js não foi encontrado no PATH.`n`nInstale o Node 22.5+ e tente de novo."
  }

  $processo = Start-Process -FilePath $node.Source `
    -ArgumentList 'dist/server.js' `
    -WorkingDirectory (Join-Path $Raiz 'backend') `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $PastaLogs 'servidor-out.log') `
    -RedirectStandardError (Join-Path $PastaLogs 'servidor-erro.log')

  Set-Content -LiteralPath $ArquivoPid -Value $processo.Id -Encoding ascii
  return $processo
}

<# Espera a porta abrir. 20s é folga larga para um Express + SQLite local. #>
function Wait-Servidor([System.Diagnostics.Process]$processo) {
  for ($tentativa = 0; $tentativa -lt 80; $tentativa++) {
    if (Test-CifraNoAr) { return }
    if ($processo -and $processo.HasExited) {
      $erro = ''
      $logErro = Join-Path $PastaLogs 'servidor-erro.log'
      if (Test-Path -LiteralPath $logErro) {
        $erro = (Get-Content -LiteralPath $logErro -Tail 10) -join "`n"
      }
      throw "O servidor encerrou logo ao subir.`n`n$erro"
    }
    Update-Splash
    Start-Sleep -Milliseconds 250
  }
  throw "O servidor não respondeu na porta $Porta a tempo.`n`nVeja logs\servidor-erro.log"
}

function Open-Cifra {
  if ($SemNavegador) { return }

  if ($Janela -eq 'app') {
    $navegadores = @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
      "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($navegador in $navegadores) {
      if (Test-Path -LiteralPath $navegador) {
        Start-Process -FilePath $navegador -ArgumentList "--app=$Url"
        return
      }
    }
  }
  Start-Process $Url
}

# ------------------------------------------------------------------ fluxo

try {
  $noAr = Test-CifraNoAr
  $precisaCompilar = Test-BuildDesatualizado
  # Mesmo com o build em dia, o processo no ar pode ser de antes dele.
  $precisaReiniciar = $noAr -and -not $precisaCompilar -and (Test-ServidorAntigo)

  # Se a porta é de um `npm run dev`, deixamos ele em paz e só abrimos a aba —
  # derrubar o servidor de desenvolvimento de alguém no meio do trabalho seria
  # a pior surpresa possível vinda de um atalho. Ele também recarrega sozinho,
  # então nunca fica velho.
  if ($noAr -and ($precisaCompilar -or $precisaReiniciar) -and (Test-ServidorDeTerceiro)) {
    $precisaCompilar = $false
    $precisaReiniciar = $false
  }

  # Caminho rápido: já está tudo pronto, é só abrir.
  if ($noAr -and -not $precisaCompilar -and -not $precisaReiniciar) {
    Open-Cifra
    exit 0
  }

  # Recompilar exige derrubar o servidor; um servidor velho, também.
  if ($noAr -and ($precisaCompilar -or $precisaReiniciar)) {
    Show-Splash 'Atualizando para a versão mais recente...'
    Stop-Cifra | Out-Null
    $noAr = $false
  }

  if ($precisaCompilar) {
    if (-not (Test-Path -LiteralPath (Join-Path $Raiz 'node_modules'))) {
      Show-Splash 'Instalando dependências (só desta vez)...'
      Invoke-Npm 'install' 'instalacao'
    }
    Show-Splash 'Compilando o app... isso leva alguns segundos.'
    Invoke-Npm 'run build' 'build'
  }

  if (-not $noAr) {
    Show-Splash 'Iniciando o CIFRA...'
    $servidor = Start-Servidor
    Wait-Servidor $servidor
  }

  Open-Cifra
  Close-Splash
  exit 0
} catch {
  Close-Splash
  $origem = $_.InvocationInfo.ScriptLineNumber
  Show-Erro ("{0}`n`n(linha {1}: {2})" -f $_.Exception.Message, $origem, $_.Exception.GetType().Name)
  exit 1
}
