# Captura em lote no aparelho

Na Minha estante, **Adicionar livros** permite fotografar várias capas juntas ou selecionar várias fotos. A câmera permanece aberta entre capturas. Detecção, recorte e OCR ficam em uma fila de Web Workers, sem enviar imagens ou texto a serviços de IA.

## Fluxo

1. Coloque as capas visíveis, lado a lado, sem sobreposição.
2. Fotografe e continue capturando enquanto as fotos anteriores são processadas.
3. Em **Revisar áreas / adicionar**, veja todas as áreas numeradas na foto. Toque em um número (ou no botão do livro) para selecionar e ajustar um recorte anterior; **+ Novo livro** inicia outra marcação. A área selecionada fica amarela e as demais verdes. Os recortes enviados continuam visíveis, mas protegidos contra alterações. Ajustes não aplicados pedem confirmação antes de sair ou trocar de livro.
4. Salve os livros com ou sem título. Títulos encontrados depois são sincronizados enquanto a tela permanece aberta. Uma edição manual nunca é substituída pelo OCR.

O lote é temporário: mantenha a tela aberta. Há aviso antes de sair com fotos, reconhecimento ou alterações pendentes. Não há recuperação de rascunhos após fechar o navegador.

## Implementação

- COCO-SSD Lite MobileNet V2 via TensorFlow.js, backend CPU em Worker. A detecção combina foto inteira com três faixas sobrepostas em fotos alongadas ou quatro regiões em fotos quase quadradas. Isso também procura capas no centro e quando a primeira passagem não encontra nada. As passagens extras têm orçamento de tempo, descartam fragmentos cortados nas bordas internas e removem duplicatas.
- Complemento geométrico local para capas separadas em fundo uniforme. São sugestões de áreas, não identificação semântica: objetos retangulares também podem ser sugeridos e exigem revisão. Fundos texturizados e objetos irregulares não usam esse complemento.
- Tesseract.js em português, com confiança e geometria das palavras/linhas para sugerir títulos. Os modelos são baixados no primeiro uso e armazenados em cache quando o navegador permite.
- Até 8 fotos por sessão, 15 MiB por arquivo e 64 MiB de fotos originais. Até 20 recortes automáticos por foto. O limite de 8 é de fotos, não de livros em uma foto.
- Fila serial, cancelamento real do Worker, limites de tempo e fallback para a foto original quando a separação não estiver disponível. É possível continuar sem reconhecimento.
- O servidor recebe somente os recortes escolhidos ao salvar, como no upload anterior. A sanitização de metadados das imagens continua ativa.
- Cada upload tem um UUID estável: tentativas repetidas retornam o livro já criado. Recortes ficam protegidos depois de iniciar o envio, inclusive quando a resposta se perde.
- A atualização de título usa uma versão `expectedUpdatedAt` com comparação atômica no D1. Respostas atrasadas são reconciliadas com a edição mais recente.
- Sem alteração de schema ou migração nova.

## Validação inicial (antes da revisão de novembro)

- `npm test`: 33 testes, incluindo fila, cancelamento, timeout, limites, seleção de títulos, recortes, uploads idempotentes, autoria e atualização concorrente.
- `npm exec -- tsc --noEmit`, `npm run lint` e `npm run build`.
- Chrome no Mac mini, larguras 390 e 1024 px: duas capturas consecutivas com câmera sintética, cada foto contendo duas capas; quatro recortes produzidos e salvos, com e sem título.
- Upload de várias imagens, correção manual, ajuste de recorte, avisos de saída e atualização de título já salvo, confirmada após voltar à estante.
- Arquivos de Worker emitidos pelo build servidos com HTTP 200 no preview local.
- Todas as gravações de QA foram feitas no D1/R2 locais, nunca em produção.

## Limitações e validação em aparelhos pendente

- O detector genérico pode perder livros, especialmente em grupos densos, capas sobrepostas ou reflexos. As passagens ampliadas melhoram a cobertura, mas não garantem recuperar todas as capas.
- OCR pode devolver só parte do título ou texto incorreto. Nos exemplos sintéticos comprimidos, surgiram “O MENINO” e um fragmento incorreto, embora o OCR da capa isolada fosse melhor. A revisão é necessária.
- Ainda não validado em iPhone/Safari ou Android físicos, nem com foto real de dez livros. O teste unitário de dez boxes valida o limite da fila, não a precisão do modelo em uma cena real.
- O primeiro download depende de rede; depois, o cache é best effort. Navegadores sem os recursos necessários mantêm o caminho manual.
- O editor reserva espaço para os controles e ações, redimensionando a foto à área disponível com `dvh` e safe area; não depende da altura natural da imagem para expor os botões.

## Revisão de detecção e edição (7 de novembro de 2026)

- Comparação CPU com o mesmo COCO-SSD Lite e montagens de capas reais disponíveis no repositório: uma fileira com quatro e cinco capas e duas fileiras com quatro e cinco capas. Versão anterior: 0 em todos esses exemplos. Versão revisada (multiescala + contornos): 4/4 e 5/5, cerca de 3,9–5 segundos no Mac mini.
- As montagens têm superfície uniforme, capas sem sobreposição e boa separação. Isso não é uma estimativa de precisão em fotos reais ou em celulares. Reflexos, perspectiva, fundo irregular e sobreposição continuam exigindo revisão.
- Regressões cobrem busca central sem detecção inicial, fragmentos nas bordas dos tiles, duplicatas, cinco capas vizinhas, limite de vinte e abstenção de contornos para fundo texturizado, círculos, objeto único, foto vazia e tiras finas.
- Chrome emulado em 360×640 com foto vertical: cinco áreas numeradas, Novo livro fixo, sliders e Aplicar/Fechar inteiramente visíveis. O rodapé ficou entre y=584 e y=628, dentro dos 640 px.
- Testes do componente exercitam cinco áreas, seleção pelos botões e pelos overlays, novo livro, confirmação de descarte e proteção dos recortes já enviados.
- Também verificados 390×844 (ações até y=832) e paisagem 844×390 (ações até y=374). Selecionar Livro 2, ajustar e aplicar gerou blob de 16.464 bytes; reabrir, Novo e Adicionar preservou anteriores e aumentou de cinco para seis áreas.
- Integração completa no uploader não concluída nesta rodada: upload foi iniciado, mas o preview foi interrompido por reinício/overlay do Vite. A validação visual/funcional acima usou um harness temporário do componente real, removido antes do build. Nenhuma gravação em produção.
