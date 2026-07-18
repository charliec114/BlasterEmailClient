export function notifyNewMail(count: number, accountLabel?: string): void {
  if (!('Notification' in window)) return

  const send = (): void => {
    const title = count === 1 ? 'Nuevo correo' : `${count} correos nuevos`
    const body = accountLabel ? `En ${accountLabel}` : 'Tenés mensajes sin leer'
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
