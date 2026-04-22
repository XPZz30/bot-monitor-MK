import csv
import re

sql_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\games_dump_complete.sql'
csv_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\produtos_excel.csv'
output_path = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\planilha_automagico_nuvemshop.csv'

# 1. Parse SQL for images
print("Parsing SQL for images...")
title_to_image = {}
with open(sql_path, 'r', encoding='utf-8') as f:
    content = f.read()
    entries = re.findall(r"INSERT INTO games VALUES\s*\('[^']+?','([^']+?)',(.*?)\);", content, re.DOTALL)
    for title, rest in entries:
        image_match = re.search(r"'(https?://[^']+?\.(?:webp|jpg|png|jpeg)[^']*?)'", rest)
        if image_match:
            title_to_image[title] = image_match.group(1)

print(f"Mapped {len(title_to_image)} titles to images.")

# 2. Define target headers based on exemplo_pt-BR.xlsx + preserving extra source columns
target_headers = [
    "Identificador", "Nome", "Categorias", 
    "Nome da variação 1", "Valor da variação 1", 
    "Nome da variação 2", "Valor da variação 2", 
    "Nome da variação 3", "Valor da variação 3", 
    "Preço", "Preço promocional", "Custo", 
    "Peso", "Peso Bruto", "Peso Líquido", 
    "Altura", "Largura", "Comprimento", 
    "Estoque", "SKU", "Código de barras", "Código de barras da embalagem", 
    "Exibir na loja", "Frete grátis", "Descrição", "Tags", 
    "Título para SEO", "Descrição para SEO", "Imagens", "Marca", "MPN",
    "Produto Físico", "Sexo", "Faixa etária" # Extra from original
]

def g(row, key):
    val = row.get(key)
    return str(val).strip() if val is not None else ""

# 3. Process CSV
print("Processing CSV...")
with open(csv_path, 'r', encoding='utf-8-sig') as f_in:
    reader = csv.DictReader(f_in, delimiter=';')
    
    def normalize_key(k):
        return k.strip().replace('"', '')

    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f_out:
        writer = csv.writer(f_out, delimiter=';', quoting=csv.QUOTE_MINIMAL)
        writer.writerow(target_headers)
        
        last_name = ""
        for row in reader:
            if not row: continue
            row_norm = {normalize_key(k): v for k, v in row.items() if k is not None}
            
            name = g(row_norm, 'Nome')
            if name:
                last_name = name
            
            image_url = title_to_image.get(last_name, "")
            
            out_row = [
                g(row_norm, 'Identificador URL'),      # Identificador
                g(row_norm, 'Nome'),                   # Nome
                g(row_norm, 'Categorias'),             # Categorias
                g(row_norm, 'Nome da variação 1'),     # Nome da variação 1
                g(row_norm, 'Valor da variação 1'),    # Valor da variação 1
                g(row_norm, 'Nome da variação 2'),     # Nome da variação 2
                g(row_norm, 'Valor da variação 2'),    # Valor da variação 2
                g(row_norm, 'Nome da variação 3'),     # Nome da variação 3
                g(row_norm, 'Valor da variação 3'),    # Valor da variação 3
                g(row_norm, 'Preço'),                  # Preço
                g(row_norm, 'Preço promocional'),      # Preço promocional
                g(row_norm, 'Custo'),                  # Custo
            ]
            
            peso = g(row_norm, 'Peso (kg)')
            out_row.extend([peso, peso, peso])         # Peso, Peso Bruto, Peso Líquido
            
            out_row.extend([
                g(row_norm, 'Altura (cm)'),            # Altura
                g(row_norm, 'Largura (cm)'),           # Largura
                g(row_norm, 'Comprimento (cm)'),       # Comprimento
                g(row_norm, 'Estoque'),                # Estoque
                g(row_norm, 'SKU')                     # SKU
            ])
            
            bars = g(row_norm, 'Código de barras')
            out_row.extend([bars, bars])               # Código de barras, Código de barras da embalagem
            
            out_row.extend([
                g(row_norm, 'Exibir na loja'),         # Exibir na loja
                g(row_norm, 'Frete grátis'),           # Frete grátis
                g(row_norm, 'Descrição'),              # Descrição
                g(row_norm, 'Tags'),                   # Tags
                g(row_norm, 'Título para SEO'),        # Título para SEO
                g(row_norm, 'Descrição para SEO'),     # Descrição para SEO
                image_url,                             # Imagens
                g(row_norm, 'Marca'),                  # Marca
                g(row_norm, 'MPN (Cód. Exclusivo Modelo Fabricante)'), # MPN
                g(row_norm, 'Produto Físico'),         # Extra 1
                g(row_norm, 'Sexo'),                   # Extra 2
                g(row_norm, 'Faixa etária')            # Extra 3
            ])
            
            writer.writerow(out_row)

print(f"Final spreadsheet created with all columns: {output_path}")
