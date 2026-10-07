from io import BytesIO

from pypdf import PdfReader


def extract_pdf_text(file_bytes: bytes) -> str:
    pdf_file = BytesIO(file_bytes)

    reader = PdfReader(pdf_file)

    pages = []

    for page in reader.pages:
        text = page.extract_text()

        if text:
            pages.append(text)

    return "\n\n".join(pages)


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    words = text.split()

    chunks = []

    start = 0

    while start < len(words):
        end = start + chunk_size

        chunk = " ".join(words[start:end])

        chunks.append(chunk)

        start += chunk_size - overlap

    return chunks