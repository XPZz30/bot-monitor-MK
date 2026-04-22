import csv
import re
import json
import unicodedata
import ast

def slugify(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text

def split_pg_array(arr_str):
    if not arr_str:
        return []
    arr_str = arr_str.strip()
    if arr_str.startswith("ARRAY["):
        content = arr_str[6:-1].strip()
    elif arr_str.startswith("["):
        content = arr_str[1:-1].strip()
    else:
        return []
        
    items = []
    current = ""
    in_quote = False
    i = 0
    while i < len(content):
        char = content[i]
        if char == "'":
            if i + 1 < len(content) and content[i+1] == "'":
                current += "'"
                i += 1
            else:
                in_quote = not in_quote
                current += char
        elif char == ',' and not in_quote:
            val = current.strip()
            if val.startswith("'") and val.endswith("'"):
                val = val[1:-1]
            items.append(val)
            current = ""
        else:
            current += char
        i += 1
    
    val = current.strip()
    if val.startswith("'") and val.endswith("'"):
        val = val[1:-1]
    items.append(val)
    return items

def parse_sql_values(sql_file):
    with open(sql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = re.compile(r"INSERT INTO games VALUES \((.*?)\);", re.DOTALL)
    matches = pattern.finditer(content)
    
    products = []
    for match in matches:
        values_str = match.group(1).strip()
        values = []
        current = ""
        in_quote = False
        bracket_level = 0
        i = 0
        while i < len(values_str):
            char = values_str[i]
            if char == "'":
                if i + 1 < len(values_str) and values_str[i+1] == "'":
                    current += "'"
                    i += 1
                else:
                    in_quote = not in_quote
                    current += char
            elif char == '[' and not in_quote:
                bracket_level += 1
                current += char
            elif char == ']' and not in_quote:
                bracket_level -= 1
                current += char
            elif char == ',' and not in_quote and bracket_level == 0:
                values.append(current.strip())
                current = ""
            else:
                current += char
            i += 1
        values.append(current.strip())
        
        if len(values) < 11:
            continue
            
        def clean_val(v):
            if v is None: return ""
            v = v.strip()
            if v.startswith("'") and v.endswith("'"):
                return v[1:-1].replace("''", "'")
            if v.upper() == "NULL":
                return ""
            return v

        title = clean_val(values[1])
        description = clean_val(values[5])
        
        genres = []
        console = ""
        options = []
        
        for v in values:
            if v.startswith("ARRAY["):
                if "'type':" in v or "'price':" in v:
                    opt_strings = split_pg_array(v)
                    for opt_s in opt_strings:
                        try:
                            python_dict_str = opt_s.replace("''", "'")
                            opt_data = ast.literal_eval(python_dict_str)
                            if isinstance(opt_data, dict):
                                options.append(opt_data)
                        except:
                            data = {}
                            m_t = re.search(r"type['\"]?\s*:\s*['\"]?(\w+)['\"]?", python_dict_str)
                            if m_t: data['type'] = m_t.group(1)
                            m_p = re.search(r"price['\"]?\s*:\s*([\d.]+)", python_dict_str)
                            if m_p: data['price'] = float(m_p.group(1))
                            if data: options.append(data)
                else:
                    genres = split_pg_array(v)
            elif v.startswith("'") and v.endswith("'") and len(v) < 20:
                val = clean_val(v)
                if val:
                    vu = val.upper()
                    if any(x in vu for x in ["PS4", "PS5", "XBOX", "PC", "NINTENDO"]):
                        console = val

        if not console and len(values) > 10:
            console = clean_val(values[10])
        if not genres and len(values) > 9:
            temp_genres = split_pg_array(values[9])
            if temp_genres: genres = temp_genres
        
        products.append({
            'title': title,
            'description': description,
            'genres': genres,
            'console': console,
            'options': options
        })
        
    return products

def convert_to_excel_rows(products):
    rows = []
    for p in products:
        title = p['title'] or ""
        console = p['console'] or ""
        genres = p['genres']
        description = p['description'] or ""
        options = p['options']
        
        url = slugify(title)
        
        platform_name = console.upper()
        if platform_name == "PS4": platform_name = "PLAYSTATION 4"
        elif platform_name == "PS5": platform_name = "PLAYSTATION 5"
        
        genres_all = [g.upper() for g in genres if g]
        genres_up = ", ".join(genres_all)
        categories = f"{platform_name} > {genres_up}" if genres_up else platform_name
        
        sku_base = slugify(title + "-" + console).upper()
        
        price_primaria = 0
        price_secundaria = 0
        for opt in options:
            t = opt.get('type')
            if t == 'primaria':
                price_primaria = opt.get('price', 0)
            elif t == 'secundaria':
                price_secundaria = opt.get('price', 0)
        
        tags_list = [title, console] + genres + ["JVGames", "JV Games"]
        tags = ", ".join([str(t) for t in tags_list if t])
        
        seo_title = f"{title} para {console}, Mídia Digital, JV Games"
        seo_desc = f"Compre {title} para {console} com entrega imediata. Jogo digital original, compatível com {console}, disponível na JV Games."
        
        # Format prices with 2 decimals
        p_primaria = "{:.2f}".format(float(price_primaria))
        p_secundaria = "{:.2f}".format(float(price_secundaria))
        
        # Row 1
        row1 = [
            url, title, categories, 'Licença', 'Primária', '', '', '', '',
            p_primaria, '0.00', '', '', '', '0.00', '', sku_base, '', 'SIM', 'SIM',
            description, tags, seo_title, seo_desc, 'JV Games', 'NÃO', '', '', '', ''
        ]
        
        # Row 2
        row2 = [
            url, '', '', 'Licença', 'Secundária', '', '', '', '',
            p_secundaria, '0.00', '0.00', '0.00', '0.00', '0.00', '', '', '', 'SIM', 'SIM',
            '', tags, seo_title, seo_desc, 'JV Games', 'NÃO', '', '', '', ''
        ]
        
        rows.append(row1)
        rows.append(row2)
    
    return rows

def main():
    sql_file = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\games_dump_complete.sql'
    aux_file = r'c:\Users\samul\OneDrive\Documents\Projetos\BotPreços\Planilha auxiliar.csv'
    output_file = 'produtos_excel.csv'
    
    # Try to get the exact header from Planilha auxiliar.csv
    try:
        with open(aux_file, 'r', encoding='utf-8-sig') as f:
            header_line = f.readline().strip()
    except:
        header_line = '"Identificador URL";Nome;Categorias;"Nome da variação 1";"Valor da variação 1";"Nome da variação 2";"Valor da variação 2";"Nome da variação 3";"Valor da variação 3";Preço;"Preço promocional";"Peso (kg)";"Altura (cm)";"Largura (cm)";"Comprimento (cm)";Estoque;SKU;"Código de barras";"Exibir na loja";"Frete grátis";Descrição;Tags;"Título para SEO";"Descrição para SEO";Marca;"Produto Físico";"MPN (Cód. Exclusivo Modelo Fabricante)";Sexo;"Faixa etária";Custo'

    products = parse_sql_values(sql_file)
    rows = convert_to_excel_rows(products)
    
    if not rows:
        return

    # Write manually to have full control over quoting (mimicking Planilha auxiliar.csv)
    with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
        f.write(header_line + '\r\n')
        for row in rows:
            # We want to quote fields that might have ; or are typically quoted in Nuvemshop
            # Based on inspection: URL(0) not quoted, Name(1) quoted, Cat(2) quoted, VarName(3) not quoted...
            # But safer to just quote string fields that often contain spaces or special chars.
            quoted_row = []
            for i, val in enumerate(row):
                s_val = str(val)
                # Mimic specific quoting patterns observed:
                # 0: URL - no quote
                # 1: Name - quoted
                # 2: Cat - quoted
                # 3,4: Var - no quote (usually)
                # 9,10: Price - no quote
                # 18,19: Yes/No - no quote
                # 20: Desc - quoted
                if i in [1, 2, 20, 21, 22, 23]:
                    quoted_row.append(f'"{s_val}"')
                else:
                    # If it contains ; must quote
                    if ';' in s_val:
                        quoted_row.append(f'"{s_val}"')
                    else:
                        quoted_row.append(s_val)
            f.write(';'.join(quoted_row) + '\r\n')
            
    print("Execution complete. Output saved to produtos_excel.csv")

if __name__ == "__main__":
    main()
