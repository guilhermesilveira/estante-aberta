# Captura em lote no aparelho

Na Minha estante, **Adicionar livros** permite fotografar várias capas juntas ou selecionar várias fotos. A câmera permanece aberta entre capturas. Detecção, recorte e OCR ficam em uma fila de Web Workers, sem enviar imagens ou texto a serviços de IA.

## Fluxo

1. Coloque as capas visíveis, lado a lado, sem sobreposição.
2. Fotografe e continue capturando enquanto as fotos anteriores são processadas.
3. Revise os livros encontrados. É possível ajustar, adicionar ou descartar recortes antes do envio.
4. Salve os livros com ou sem título. Títulos encontrados depois são sincronizados enquanto a tela permanece aberta. Uma edição manual nunca é substituída pelo OCR.

O lote é temporário: mantenha a tela aberta. Há aviso antes de sair com fotos, reconhecimento ou alterações pendentes. Não há recuperação de rascunhos após fechar o navegador.

## Implementação

- COCO-SSD Lite MobileNet V2 via TensorFlow.js, backend CPU em Worker. A detecção usa no máximo duas passagens: foto inteira e uma faixa lateral ainda descoberta, quando relevante.
- Tesseract.js em português, com confiança e geometria das palavras/linhas para sugerir títulos. Os modelos são baixados no primeiro uso e armazenados em cache quando o navegador permite.
- Até 8 fotos por sessão, 15 MiB por arquivo e 64 MiB de fotos originais. Até 20 recortes automáticos por foto. O limite de 8 é de fotos, não de livros em uma foto.
- Fila serial, cancelamento real do Worker, limites de tempo e fallback para a foto original quando a separação não estiver disponível. É possível continuar sem reconhecimento.
- O servidor recebe somente os recortes escolhidos ao salvar, como no upload anterior. A sanitização de metadados das imagens continua ativa.
- Cada upload tem um UUID estável: tentativas repetidas retornam o livro já criado. Recortes ficam protegidos depois de iniciar o envio, inclusive quando a resposta se perde.
- A atualização de título usa uma versão `expectedUpdatedAt` com comparação atômica no D1. Respostas atrasadas são reconciliadas com a edição mais recente.
- Sem alteração de schema ou migração nova.

## Validação feita

- `npm test`: 33 testes, incluindo fila, cancelamento, timeout, limites, seleção de títulos, recortes, uploads idempotentes, autoria e atualização concorrente.
- `npm exec -- tsc --noEmit`, `npm run lint` e `npm run build`.
- Chrome no Mac mini, larguras 390 e 1024 px: duas capturas consecutivas com câmera sintética, cada foto contendo duas capas; quatro recortes produzidos e salvos, com e sem título.
- Upload de várias imagens, correção manual, ajuste de recorte, avisos de saída e atualização de título já salvo, confirmada após voltar à estante.
- Arquivos de Worker emitidos pelo build servidos com HTTP 200 no preview local.
- Todas as gravações de QA foram feitas no D1/R2 locais, nunca em produção.

## Limitações e validação pendente

- O detector genérico pode perder livros, especialmente em grupos densos, capas sobrepostas ou reflexos. A segunda passagem não garante recuperar livros omitidos no meio do grupo.
- OCR pode devolver só parte do título ou texto incorreto. Nos exemplos sintéticos comprimidos, surgiram “O MENINO” e um fragmento incorreto, embora o OCR da capa isolada fosse melhor. A revisão é necessária.
- Ainda não validado em iPhone/Safari ou Android físicos, nem com foto real de dez livros. O teste unitário de dez boxes valida o limite da fila, não a precisão do modelo em uma cena real.
- O primeiro download depende de rede; depois, o cache é best effort. Navegadores sem os recursos necessários mantêm o caminho manual.
- O trabalho foi preparado para revisão, sem merge ou publicação no site.
