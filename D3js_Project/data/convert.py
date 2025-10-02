import json

# 输入文件：SNAP Facebook ego network
input_file = "data/facebook_combined.txt"
output_file = "data/facebook_graph.json"

nodes_set = set()
links = []

# 读取边列表
with open(input_file, "r") as f:
    for line in f:
        parts = line.strip().split()
        if len(parts) != 2:
            continue
        u, v = parts
        nodes_set.add(u)
        nodes_set.add(v)
        links.append((u, v))

# 将节点按原始 ID 排序（可选）
nodes_list = sorted(list(nodes_set))

# 建立节点索引到 ID 的映射
id_map = {node: node for node in nodes_list}

# 构建 JSON 的 nodes 和 links
json_nodes = [{"id": node} for node in nodes_list]
json_links = [{"source": u, "target": v} for u, v in links]

# 输出 JSON
graph = {"nodes": json_nodes, "links": json_links}

with open(output_file, "w") as f:
    json.dump(graph, f, indent=2)

print(f"转换完成！已生成 {output_file}")
