import { profileApiUrl, profileFetch } from "./api.js";
async function request(method, path, body) {
  let response;
  try {
    response = await profileFetch(profileApiUrl("/spanish/api/books" + path), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Нет связи с сервером. Результат не сохранён; проверь интернет и повтори.",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Не удалось загрузить книги.");
  return data;
}
export const booksApi = {
  dashboard: () => request("GET", "/"),
  lesson: (id) => request("GET", `/lessons/${id}`),
  reading: (id, data) => request("POST", `/lessons/${id}/reading`, data),
  start: (bookId, lessonId, markEarlier) =>
    request("POST", `/${bookId}/starting-point`, { lessonId, markEarlier }),
  prepare: (id, kind) => request("POST", `/lessons/${id}/prepare`, { kind }),
  preparation: (id) => request("GET", `/preparations/${id}`),
  run: (id) => request("GET", `/runs/${id}`),
  answer: (id, itemId, body) =>
    request("POST", `/runs/${id}/items/${itemId}/answer`, body),
  hint: (id, itemId) => request("POST", `/runs/${id}/items/${itemId}/hint`, {}),
  reveal: (id, itemId) =>
    request("POST", `/runs/${id}/items/${itemId}/reveal`, {}),
  conversation: (id, runId, mode = "chat") =>
    request("POST", `/lessons/${id}/conversation`, { runId, mode }),
  word: (id, index) => request("POST", `/runs/${id}/vocabulary/${index}`, {}),
  checkApplication: (lessonId, sessionId) =>
    request(
      "POST",
      `/lessons/${lessonId}/conversations/${sessionId}/check`,
      {},
    ),
  async page(bookId, page, signal) {
    const r = await profileFetch(
      profileApiUrl(`/spanish/api/books/${bookId}/pages/${page}`),
      { signal },
    );
    if (!r.ok)
      throw new Error(
        "Не удалось загрузить страницу. Проверь связь и повтори.",
      );
    return r.blob();
  },
};
