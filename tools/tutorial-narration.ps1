$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$strideRoot=Split-Path -Parent $PSScriptRoot
$strideOutput=Join-Path $strideRoot 'build/tutorial'
New-Item -ItemType Directory -Force -Path $strideOutput | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'tutorial-scenes.json') -Destination (Join-Path $strideOutput 'scenes.json')
$strideScenes=Get-Content -LiteralPath (Join-Path $strideOutput 'scenes.json') -Raw -Encoding utf8 | ConvertFrom-Json
$strideNarrator=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $strideNarrator.SelectVoice('Microsoft Huihui Desktop')
    $strideNarrator.Rate=1
    for($strideIndex=0;$strideIndex -lt $strideScenes.Count;$strideIndex++){
        $strideNarrator.SetOutputToWaveFile((Join-Path $strideOutput ('voice-{0}.wav' -f $strideIndex)))
        $strideNarrator.Speak($strideScenes[$strideIndex].speech)
    }
} finally { $strideNarrator.Dispose() }
