' Abre o CIFRA sem piscar janela de terminal.
' Este arquivo so repassa a chamada para scripts\iniciar-cifra.ps1 com a
' janela escondida (o terceiro argumento de Run, 0). Argumentos extras sao
' encaminhados: por exemplo, -Janela app abre sem barra de endereco.

Option Explicit

Dim shell, fso, raiz, script, comando, extras, argumento

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

raiz = fso.GetParentFolderName(WScript.ScriptFullName)
script = raiz & "\scripts\iniciar-cifra.ps1"

extras = ""
For Each argumento In WScript.Arguments
  extras = extras & " " & argumento
Next

comando = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & script & """" & extras

shell.Run comando, 0, False
