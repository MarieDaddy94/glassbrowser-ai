!macro customInit
  ; Force a stable per-user install root and ignore stale previous locations
  ; (e.g. accidental Temp\*_extract paths captured in older installs).
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
!macroend

!macro customInstall
  ; Intentionally empty: finish-page auto-run is disabled via
  ; build.nsis.runAfterFinish=false in package.json.
!macroend
