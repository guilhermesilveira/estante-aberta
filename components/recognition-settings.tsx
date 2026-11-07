'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { OCR_LANGUAGES } from '@/lib/title-inference';
import {
  getModelState,
  getOCRLanguage,
  setOCRLanguage,
  startTitleModel,
  stopTitleModel,
  subscribeModel,
} from '@/lib/local-title-model';
export function RecognitionSettings() {
  const [model, setModel] = useState(getModelState);
  const [language, setLanguage] = useState(getOCRLanguage);
  useEffect(() => subscribeModel(() => setModel(getModelState())), []);
  return (
    <details className="mt-4 rounded-xl border bg-white/60 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Leitura de títulos e idiomas
      </summary>
      <label className="mt-3 block">
        Idioma das próximas fotos
        <select
          className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3"
          value={language}
          onChange={(event) => {
            setLanguage(event.target.value);
            setOCRLanguage(event.target.value);
          }}
        >
          {OCR_LANGUAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-muted-foreground">
        Os dados do idioma são baixados quando necessário. Para capas em outro
        idioma, selecione-o antes de fotografar.
      </p>
      <p className="mt-3 font-medium">
        IA local para separar título de autor (experimental)
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Qwen3.5 0,8B: download de cerca de 500 MB, além do leitor. Prefira
        Wi-Fi. Requer WebGPU e memória disponível; pode não funcionar neste
        aparelho. Fotos e texto não vão para serviços de IA. Você sempre pode
        revisar à mão.
      </p>
      <output className="mt-2 text-sm">
        {model.status === 'ready'
          ? 'IA pronta. Será usada nos próximos títulos reconhecidos.'
          : model.status === 'loading'
            ? `Preparando IA… ${model.total ? `${Math.round((model.loaded / model.total) * 100)}% do arquivo atual` : ''}`
            : model.status === 'error'
              ? 'IA indisponível ou tempo esgotado. A leitura normal e a revisão manual continuam disponíveis.'
              : 'Sem IA extra. A leitura normal continua ativa.'}
      </output>
      {model.status === 'off' || model.status === 'error' ? (
        <Button
          className="mt-2"
          variant="outline"
          onClick={() => void startTitleModel()}
        >
          Baixar e ativar IA local
        </Button>
      ) : (
        <Button
          className="mt-2"
          variant="outline"
          onClick={() => stopTitleModel()}
        >
          {model.status === 'loading' ? 'Cancelar download' : 'Desativar IA'}
        </Button>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        O navegador pode guardar o modelo em cache. Desativar libera a memória;
        para apagar o download, limpe os dados deste site nas configurações do
        navegador.
      </p>
    </details>
  );
}
