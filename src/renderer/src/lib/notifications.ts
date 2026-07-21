function buildNotificationBody(count: number, accountLabel?: string, senderName?: string): string {
  if (senderName && accountLabel) {
    return count === 1
      ? `Nuevo mensaje de ${senderName} en la cuenta ${accountLabel}`
      : `Último de ${senderName} en la cuenta ${accountLabel}`
  }
  if (accountLabel) return `En ${accountLabel}`
  return 'Tenés mensajes sin leer'
}

export function notifyNewMail(count: number, accountLabel?: string, senderName?: string): void {
  if (!('Notification' in window)) return

  const send = (): void => {
    const title = count === 1 ? 'Nuevo correo' : `${count} correos nuevos`
    const body = buildNotificationBody(count, accountLabel, senderName)
    const notification = new Notification(title, { body, icon: '/icon.png' })
    notification.onclick = () => {
      window.api.app.focusWindow()
    }
  }

  if (Notification.permission === 'granted') {
    send()
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') send()
    })
  }
}
