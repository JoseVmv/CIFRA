<#
  Cria o atalho do CIFRA na área de trabalho e no menu Iniciar.
  Roda uma vez só; depois é só clicar no atalho.

    powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1

  Opções:
    -Janela app   o atalho abre uma janela limpa, sem barra de endereço
    -SomenteMenu  não cria o atalho na área de trabalho
#>
[CmdletBinding()]
param(
  [ValidateSet('aba', 'app')]
  [string]$Janela = 'aba',
  [switch]$SomenteMenu
)

. (Join-Path $PSScriptRoot '_comum.ps1')

Add-Type -AssemblyName System.Drawing

# ------------------------------------------------------------------- ícone

function New-CaminhoArredondado([single]$lado, [single]$raio) {
  $caminho = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diametro = $raio * 2
  $caminho.AddArc(0, 0, $diametro, $diametro, 180, 90)
  $caminho.AddArc($lado - $diametro, 0, $diametro, $diametro, 270, 90)
  $caminho.AddArc($lado - $diametro, $lado - $diametro, $diametro, $diametro, 0, 90)
  $caminho.AddArc(0, $lado - $diametro, $diametro, $diametro, 90, 90)
  $caminho.CloseFigure()
  return $caminho
}

<# Desenha o mesmo símbolo do favicon: cifrão branco sobre verde. #>
function New-BitmapDoIcone([int]$lado) {
  $imagem = New-Object System.Drawing.Bitmap($lado, $lado, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $desenho = [System.Drawing.Graphics]::FromImage($imagem)
  $desenho.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $desenho.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $desenho.Clear([System.Drawing.Color]::Transparent)

  $fundo = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#12A150'))
  $forma = New-CaminhoArredondado $lado ($lado * 0.24)
  $desenho.FillPath($fundo, $forma)

  $fonte = New-Object System.Drawing.Font('Segoe UI', ($lado * 0.60), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $alinhamento = New-Object System.Drawing.StringFormat
  $alinhamento.Alignment = [System.Drawing.StringAlignment]::Center
  $alinhamento.LineAlignment = [System.Drawing.StringAlignment]::Center
  $area = New-Object System.Drawing.RectangleF(0, 0, $lado, $lado)
  $desenho.DrawString('$', $fonte, [System.Drawing.Brushes]::White, $area, $alinhamento)

  $alinhamento.Dispose()
  $fonte.Dispose()
  $forma.Dispose()
  $fundo.Dispose()
  $desenho.Dispose()

  return $imagem
}

<# A vírgula nos "return" abaixo impede o PowerShell de esparramar o array byte a byte. #>
function Convert-BitmapParaPng([System.Drawing.Bitmap]$imagem) {
  $memoria = New-Object System.IO.MemoryStream
  $imagem.Save($memoria, [System.Drawing.Imaging.ImageFormat]::Png)
  [byte[]]$bytes = $memoria.ToArray()
  $memoria.Dispose()
  return , $bytes
}

<#
  Codifica no formato antigo (BITMAPINFOHEADER + pixels BGRA de baixo para cima
  + máscara AND zerada). É o que todo canto do Windows sabe ler nas resoluções
  pequenas — PNG embutido só é garantido no 256.
#>
function Convert-BitmapParaDib([System.Drawing.Bitmap]$imagem) {
  $lado = $imagem.Width
  $area = New-Object System.Drawing.Rectangle(0, 0, $lado, $lado)
  $trava = $imagem.LockBits($area, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $passo = $trava.Stride
  [byte[]]$pixels = New-Object byte[] ($passo * $lado)
  [System.Runtime.InteropServices.Marshal]::Copy($trava.Scan0, $pixels, 0, $pixels.Length)
  $imagem.UnlockBits($trava)

  $memoria = New-Object System.IO.MemoryStream
  $escritor = New-Object System.IO.BinaryWriter($memoria)

  $escritor.Write([uint32]40)          # biSize
  $escritor.Write([int32]$lado)        # biWidth
  $escritor.Write([int32]($lado * 2))  # biHeight: imagem + máscara, como pede o formato
  $escritor.Write([uint16]1)           # biPlanes
  $escritor.Write([uint16]32)          # biBitCount
  $escritor.Write([uint32]0)           # biCompression: BI_RGB
  $escritor.Write([uint32]0)           # biSizeImage: zero é válido em BI_RGB
  $escritor.Write([int32]0)            # biXPelsPerMeter
  $escritor.Write([int32]0)            # biYPelsPerMeter
  $escritor.Write([uint32]0)           # biClrUsed
  $escritor.Write([uint32]0)           # biClrImportant

  for ($linha = $lado - 1; $linha -ge 0; $linha--) {
    $escritor.Write($pixels, $linha * $passo, $passo)
  }

  # Máscara AND zerada: a transparência real vem do canal alfa dos pixels.
  $bytesPorLinha = [int]([math]::Floor(($lado + 31) / 32) * 4)
  [byte[]]$mascara = New-Object byte[] ($bytesPorLinha * $lado)
  $escritor.Write($mascara, 0, $mascara.Length)

  $escritor.Flush()
  [byte[]]$bytes = $memoria.ToArray()
  $escritor.Dispose()
  $memoria.Dispose()
  return , $bytes
}

<# Monta o .ico com várias resoluções, cada uma no formato que o Windows lê melhor. #>
function New-ArquivoIcone([string]$destino) {
  $lados = @(256, 128, 64, 48, 32, 16)
  $imagens = @()
  foreach ($lado in $lados) {
    $bitmap = New-BitmapDoIcone $lado
    [byte[]]$bytes = if ($lado -ge 256) {
      Convert-BitmapParaPng $bitmap
    } else {
      Convert-BitmapParaDib $bitmap
    }
    $bitmap.Dispose()
    $imagens += , @{ Lado = $lado; Bytes = $bytes }
  }

  $arquivo = [System.IO.File]::Create($destino)
  $escritor = New-Object System.IO.BinaryWriter($arquivo)
  try {
    $escritor.Write([uint16]0)                 # reservado
    $escritor.Write([uint16]1)                 # tipo: ícone
    $escritor.Write([uint16]$imagens.Count)

    $deslocamento = 6 + (16 * $imagens.Count)
    foreach ($imagem in $imagens) {
      $escritor.Write([byte]($imagem.Lado -band 0xFF))  # 256 vira 0, como manda o formato
      $escritor.Write([byte]($imagem.Lado -band 0xFF))
      $escritor.Write([byte]0)                 # cores da paleta
      $escritor.Write([byte]0)                 # reservado
      $escritor.Write([uint16]1)               # planos
      $escritor.Write([uint16]32)              # bits por pixel
      $escritor.Write([uint32]$imagem.Bytes.Length)
      $escritor.Write([uint32]$deslocamento)
      $deslocamento += $imagem.Bytes.Length
    }

    foreach ($imagem in $imagens) {
      [byte[]]$dados = $imagem.Bytes
      $escritor.Write($dados, 0, $dados.Length)
    }
  } finally {
    $escritor.Dispose()
    $arquivo.Dispose()
  }
}

# ------------------------------------------------------------------ atalhos

$icone = Join-Path $PSScriptRoot 'cifra.ico'
New-ArquivoIcone $icone

$lancador = Join-Path $Raiz 'Iniciar CIFRA.vbs'
if (-not (Test-Path -LiteralPath $lancador)) {
  throw "Não encontrei o arquivo 'Iniciar CIFRA.vbs' na raiz do projeto."
}

$argumentos = """$lancador"""
if ($Janela -eq 'app') { $argumentos += ' -Janela app' }

$shell = New-Object -ComObject WScript.Shell
$criados = @()

function New-AtalhoCifra([string]$destino) {
  $atalho = $shell.CreateShortcut($destino)
  $atalho.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $atalho.Arguments = $argumentos
  $atalho.WorkingDirectory = $Raiz
  $atalho.IconLocation = "$icone,0"
  $atalho.Description = 'Controle financeiro pessoal — abre o CIFRA no navegador'
  $atalho.WindowStyle = 7   # minimizado: o wscript nem aparece
  $atalho.Save()
}

if (-not $SomenteMenu) {
  $areaDeTrabalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'CIFRA.lnk'
  New-AtalhoCifra $areaDeTrabalho
  $criados += $areaDeTrabalho
}

$menuIniciar = Join-Path ([Environment]::GetFolderPath('Programs')) 'CIFRA.lnk'
New-AtalhoCifra $menuIniciar
$criados += $menuIniciar

Write-Output 'Atalhos criados:'
foreach ($criado in $criados) { Write-Output "  $criado" }
Write-Output ''
Write-Output "Clique no atalho (ou digite CIFRA no menu Iniciar) para abrir o app em $Url."
