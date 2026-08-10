' Encerra o servidor do CIFRA que roda em segundo plano.
' Os dados continuam salvos em data\finance.sqlite.

Option Explicit

Dim shell, fso, raiz, script, comando

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

raiz = fso.GetParentFolderName(WScript.ScriptFullName)
script = raiz & "\scripts\parar-cifra.ps1"

comando = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & script & """"

shell.Run comando, 0, False
