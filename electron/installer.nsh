!macro customInit
  ; Force a stable per-user install root and ignore stale previous locations
  ; (e.g. accidental Temp\*_extract paths captured in older installs).
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
!macroend

