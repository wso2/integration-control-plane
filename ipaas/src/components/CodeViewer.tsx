/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useCallback, useState, useMemo } from 'react';
import { Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { Copy, Check } from '@wso2/oxygen-ui-icons-react';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

// The light Prism build ships no languages by default — register only what
// CodeViewerProps['language'] supports. 'markup' registers the 'xml' alias
// itself; 'text' needs no registration (the library special-cases it as
// plain, unhighlighted output).
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);

const formatCode = (code: string, language: string): string => {
  if (!code) return 'No content available.';
  try {
    if (language === 'json') return JSON.stringify(JSON.parse(code), null, 2);
    if (language === 'xml') {
      const PAD = '  ';
      const xml = code.replace(/(>)(<)(\/*)/g, '$1\r\n$2$3');
      let formatted = '';
      let depth = 0;
      xml.split('\r\n').forEach((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
          indent = 0;
        } else if (node.match(/^<\/\w/) && depth > 0) {
          depth -= 1;
        } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
          indent = 1;
        }
        formatted += `${PAD.repeat(depth)}${node}\r\n`;
        depth += indent;
      });
      return formatted.trim();
    }
    return code;
  } catch {
    return code;
  }
};

interface CodeViewerProps {
  code: string;
  language?: 'xml' | 'json' | 'yaml' | 'javascript' | 'typescript' | 'text';
  title?: string;
  showCopyButton?: boolean;
  maxHeight?: string | number;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
}

export default function CodeViewer({ code, language = 'xml', title, showCopyButton = true, maxHeight = '60vh', showLineNumbers = true, wrapLongLines = false }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const formattedCode = useMemo(() => formatCode(code, language), [code, language]);

  const handleCopy = useCallback(() => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [code]);

  return (
    <Box>
      {(title || showCopyButton) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          {title && <Typography variant="subtitle2">{title}</Typography>}
          {showCopyButton && (
            <Button variant="text" size="small" color="inherit" startIcon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={handleCopy} disabled={!code} sx={{ ml: 'auto', color: 'text.secondary' }}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </Stack>
      )}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'auto', maxHeight, bgcolor: '#fafafa' }}>
        <SyntaxHighlighter
          language={language}
          style={prism}
          showLineNumbers={showLineNumbers}
          wrapLongLines={wrapLongLines}
          customStyle={{ margin: 0, padding: 16, fontSize: '13px', backgroundColor: 'transparent', lineHeight: '1.5' }}
          lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#999', userSelect: 'none' }}>
          {formattedCode}
        </SyntaxHighlighter>
      </Box>
    </Box>
  );
}
