# Captura em lote

## Funcionamento atual

Na Minha estante, **Adicionar livros** permite fotografar várias capas juntas ou selecionar várias fotos. Escolha empréstimo ou doação antes de começar. A câmera permanece aberta entre capturas, enquanto a detecção e o recorte de capas são processados localmente em uma fila de Web Workers.

1. Fotografe capas separadas e sem sobreposição.
2. Revise as áreas detectadas e ajuste, acrescente ou remova recortes.
3. Digite o título de cada livro se quiser; o campo é opcional. Alterar um recorte preserva o título digitado.
4. Salve os livros e aguarde a confirmação dos envios antes de sair.

O OCR, a seleção de linhas reconhecidas e a LLM local de títulos foram retirados em 7 de novembro de 2026. Não há downloads de modelos de linguagem ou leitura automática de texto. A detecção de capas continua usando TensorFlow/COCO-SSD, com contornos como complemento e recorte manual quando necessário. Fotos não são enviadas a serviços de IA.

Limites: até 8 fotos por lote, 15 MB por foto, 64 MB por lote e 20 recortes por foto. O título aceita até 200 caracteres. A listagem em cards/tabela, os livros existentes e as modalidades de empréstimo/doação não mudam.

## Verificação

Testes automatizados cobrem fila, cancelamento, timeout, detecção, recortes, cadastro e atualizações manuais. Testes em celular físico com fotos reais continuam recomendados.
