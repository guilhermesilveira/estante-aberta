export type RequestStatusNotificationInput = {
  requestId: string;
  status: 'accepted' | 'declined';
  confirmedCount: number;
  unavailableCount: number;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

function bookCount(count: number) {
  return count === 1 ? '1 livro' : `${count} livros`;
}

export function requestStatusNotification(
  input: RequestStatusNotificationInput,
): PushNotificationPayload {
  const url = `/meus-pedidos/${input.requestId}`;
  const tag = `pedido-status-${input.requestId}`;

  if (input.status === 'declined') {
    return {
      title: 'Livros não disponíveis',
      body:
        input.unavailableCount === 1
          ? 'O livro do seu pedido não pôde ser separado.'
          : `Nenhum dos ${bookCount(input.unavailableCount)} do seu pedido pôde ser separado.`,
      tag,
      url,
    };
  }

  const confirmed = `${bookCount(input.confirmedCount)} ${
    input.confirmedCount === 1 ? 'confirmado' : 'confirmados'
  }.`;
  const unavailable = input.unavailableCount
    ? ` ${bookCount(input.unavailableCount)} ${
        input.unavailableCount === 1
          ? 'não pôde ser separado.'
          : 'não puderam ser separados.'
      }`
    : '';

  return {
    title: 'Pedido confirmado',
    body: `${confirmed}${unavailable}`,
    tag,
    url,
  };
}
