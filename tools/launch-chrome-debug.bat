@echo off
:: Lance Chrome avec le remote debugging sur le port 9222
:: Permet a Antigravity (MCP chrome-devtools) de se connecter a ton Chrome
:: et de tester l'extension nya-su directement.
::
:: UTILISATION :
::   1. Ferme TOUS les fenetres Chrome ouvertes
::   2. Double-clique sur ce fichier
::   3. Chrome s'ouvre avec le debugging actif
::   4. Recharge l'extension sur chrome://extensions
::   5. Dis "ouvre le MCP chrome" a Antigravity

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set PROFILE=%USERPROFILE%\AppData\Local\Google\Chrome\NyaSuDebug

echo Lancement de Chrome avec remote debugging sur port 9222...
echo Profil isole : %PROFILE%
echo.

%CHROME% ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  "chrome://extensions"

