Set-Location 'd:\KuGou\Lyric\follow-builders'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
npm run run-daily-digest | Out-File -LiteralPath 'd:\KuGou\Lyric\follow-builders\daily-digest.log' -Encoding utf8 -Append
