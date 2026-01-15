export default async function handler(req, res) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONSリクエストの処理
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POSTのみ許可
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { hypotheses } = req.body;

    if (!hypotheses || !Array.isArray(hypotheses) || hypotheses.length === 0) {
      return res.status(400).json({ error: '有効な仮説データがありません' });
    }

    const prompt = `あなたは熟練した理学療法士です。以下の仮説と、それぞれに関連付けられた評価所見のリストを分析し、フローチャートとして構造化してください。

提供された各「仮説」に対して、'problem'タイプの親ノードを1つ作成してください。
その仮説に紐づく各「評価所見」について、改行(\\n)で区切られた各行を独立した'finding'タイプの子ノードとして作成し、対応する親（仮説）ノードに接続してください。

入力データ:
---
${hypotheses.map((h, index) => `
仮説 ${index + 1}: ${h.hypothesis}
関連所見:
${h.findings}
`).join('\n---\n')}
---

このフローチャート構造を表すJSONオブジェクトを生成してください。
- JSONには "nodes" という単一のキーが含まれている必要があります。
- "nodes" は、フローチャート内の各ノードを表すオブジェクトの配列です。
- 各ノードには、一意の 'id' (例: "problem-1", "finding-1-1")、'label'、'type' ('problem' または 'finding')、そして 'parentId' が必要です。
- 仮説から生成されるノード（'problem' type）の 'parentId' は null にしてください。
- 所見から生成されるノード（'finding' type）には、接続先の仮説ノードの 'id' を 'parentId' として設定してください。`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json'
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || 'Gemini APIエラーが発生しました');
    }

    const jsonText = result.candidates[0].content.parts[0].text;
    const data = JSON.parse(jsonText);

    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new Error('無効なデータ構造がAPIから返されました');
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Flowchart generation error:', error);
    return res.status(500).json({ error: error.message || '予期せぬエラーが発生しました' });
  }
}
