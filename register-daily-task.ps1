$logPath = 'd:\KuGou\Lyric\follow-builders\daily-digest.log'
$scriptPath = 'd:\KuGou\Lyric\follow-builders\run-daily-digest-task.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -File '$scriptPath'"
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00AM
Register-ScheduledTask -TaskName 'FollowBuildersDailyDigest' -Action $action -Trigger $trigger -Description 'Generate Follow Builders daily digest and send Feishu doc every morning' -Force
