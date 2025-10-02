class NetworkVisualization {
    constructor() {
        this.data = null;
        this.simulation = null;
        this.svg = null;
        this.nodeGroup = null;
        this.linkGroup = null;
        this.tooltip = null;
        this.zoom = null;
        this.currentHighlighted = null;
        this.isPaused = false;
        this.filteredData = null;
        this.animationFrameId = null;
        this.lastUpdateTime = 0;
        this.updateThrottle = 16;
        
        // 配置参数
        this.config = {
            width: window.innerWidth,
            height: window.innerHeight - 120,
            chargeStrength: -30,
            linkDistance: 80,
            nodeRadius: 4,
            maxNodes: 2000, // 减少最大节点数
            minNodeRadius: 2,
            maxNodeRadius: 6,
            simulationAlpha: 0.3,
            simulationDecay: 0.02
        };
        
        this.init();
    }
    
    async init() {
        this.showLoading(true);
        await this.loadData();
        this.setupSVG();
        this.setupEventListeners();
        this.createVisualization();
        this.updateStatistics();
        this.showLoading(false);
    }
    
    async loadData() {
        try {
            const rawData = await d3.json("data/facebook_graph.json");
            console.log("原始数据加载完成:", rawData);
            
            // 数据预处理
            this.data = this.preprocessData(rawData);
            this.filteredData = { ...this.data };
            
            console.log("数据预处理完成:", this.data);
        } catch (error) {
            console.error("数据加载失败:", error);
            alert("数据加载失败，请检查文件路径");
        }
    }
    
    preprocessData(rawData) {
        // 限制节点数量以提高性能
        const maxNodes = this.config.maxNodes;
        let nodes = rawData.nodes;
        let links = rawData.links;
        
        if (nodes.length > maxNodes) {
            // 选择度数最高的节点
            const nodeDegrees = new Map();
            links.forEach(link => {
                nodeDegrees.set(link.source, (nodeDegrees.get(link.source) || 0) + 1);
                nodeDegrees.set(link.target, (nodeDegrees.get(link.target) || 0) + 1);
            });
            
            const sortedNodes = nodes
                .map(node => ({ ...node, degree: nodeDegrees.get(node.id) || 0 }))
                .sort((a, b) => b.degree - a.degree)
                .slice(0, maxNodes);
            
            const selectedNodeIds = new Set(sortedNodes.map(n => n.id));
            nodes = sortedNodes;
            links = links.filter(link => 
                selectedNodeIds.has(link.source) && selectedNodeIds.has(link.target)
            );
        }
        
        // 处理节点数据 - 优化数据结构
        const processedNodes = nodes.map((node, i) => ({
            id: node.id,
            group: node.group || Math.floor(Math.random() * 10),
            degree: 0,
            neighbors: new Set(),
            x: Math.random() * this.config.width,
            y: Math.random() * this.config.height,
            originalData: node,
            // 预计算半径避免重复计算
            radius: 0
        }));
        
        // 建立节点映射
        const nodeById = new Map(processedNodes.map(d => [d.id, d]));
        
        // 处理连接数据并计算度数
        const processedLinks = links.map(link => {
            const source = nodeById.get(link.source);
            const target = nodeById.get(link.target);
            
            if (source && target) {
                source.neighbors.add(target);
                target.neighbors.add(source);
                source.degree++;
                target.degree++;
                
                return {
                    source: source,
                    target: target,
                    originalData: link
                };
            }
            return null;
        }).filter(Boolean);
        
        // 预计算节点半径
        processedNodes.forEach(node => {
            node.radius = Math.max(
                this.config.minNodeRadius, 
                Math.min(this.config.maxNodeRadius, node.degree / 3)
            );
        });
        
        return {
            nodes: processedNodes,
            links: processedLinks
        };
    }
    
    setupSVG() {
        this.svg = d3.select("#networkSvg")
            .attr("width", this.config.width)
            .attr("height", this.config.height);
        
        // 设置缩放 - 优化性能
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 5]) // 限制缩放范围
            .on("zoom", (event) => {
                this.nodeGroup.attr("transform", event.transform);
                this.linkGroup.attr("transform", event.transform);
            });
        
        this.svg.call(this.zoom);
        
        // 创建组
        this.linkGroup = this.svg.append("g").attr("class", "links");
        this.nodeGroup = this.svg.append("g").attr("class", "nodes");
        
        // 工具提示
        this.tooltip = d3.select("#tooltip");
    }
    
    setupEventListeners() {
        // 搜索功能
        d3.select("#searchBtn").on("click", () => this.searchNode());
        d3.select("#searchInput").on("keypress", (event) => {
            if (event.key === "Enter") this.searchNode();
        });
        d3.select("#clearSearchBtn").on("click", () => this.clearSearch());
        
        // 缩放控制
        d3.select("#zoomInBtn").on("click", () => this.zoomIn());
        d3.select("#zoomOutBtn").on("click", () => this.zoomOut());
        d3.select("#resetZoomBtn").on("click", () => this.resetZoom());
        
        // 筛选控制
        d3.select("#degreeRange").on("input", (event) => {
            const value = event.target.value;
            d3.select("#degreeValue").text(value);
            this.filterByDegree(value);
        });
        
        d3.select("#displayMode").on("change", (event) => {
            this.setDisplayMode(event.target.value);
        });
        
        // 布局控制
        d3.select("#restartSimulationBtn").on("click", () => this.restartSimulation());
        d3.select("#pauseSimulationBtn").on("click", () => this.togglePause());
        
        d3.select("#chargeStrength").on("input", (event) => {
            const value = parseInt(event.target.value);
            d3.select("#chargeValue").text(value);
            this.updateForceParameters();
        });
        
        d3.select("#linkDistance").on("input", (event) => {
            const value = parseInt(event.target.value);
            d3.select("#linkValue").text(value);
            this.updateForceParameters();
        });
        
        // 导出功能
        d3.select("#exportPNGBtn").on("click", () => this.exportPNG());
        d3.select("#exportSVGBtn").on("click", () => this.exportSVG());
        d3.select("#exportJSONBtn").on("click", () => this.exportLayout());
        d3.select("#importLayoutBtn").on("click", () => d3.select("#layoutFileInput").node().click());
        d3.select("#layoutFileInput").on("change", (event) => this.importLayout(event));
        
        // 详情面板
        d3.select("#closeDetailBtn").on("click", () => this.closeDetailPanel());
        
        // 窗口大小调整
        window.addEventListener("resize", () => this.handleResize());
    }
    
    createVisualization() {
        this.createLinks();
        this.createNodes();
        this.startSimulation();
    }
    
    createLinks() {
        this.linkGroup.selectAll(".link")
            .data(this.filteredData.links)
            .enter()
            .append("line")
            .attr("class", "link")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", 1);
    }
    
    createNodes() {
        const nodes = this.nodeGroup.selectAll(".node")
            .data(this.filteredData.nodes)
            .enter()
            .append("circle")
            .attr("class", "node")
            .attr("r", d => d.radius) // 使用预计算的半径
            .attr("fill", d => d3.schemeCategory10[d.group % 10])
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .call(this.drag())
            .on("mouseover", (event, d) => this.showTooltip(event, d))
            .on("mouseout", () => this.hideTooltip())
            .on("click", (event, d) => this.showNodeDetail(d));
    }
    
    startSimulation() {
        this.simulation = d3.forceSimulation(this.filteredData.nodes)
            .force("link", d3.forceLink(this.filteredData.links)
                .id(d => d.id)
                .distance(this.config.linkDistance))
            .force("charge", d3.forceManyBody()
                .strength(this.config.chargeStrength))
            .force("center", d3.forceCenter(this.config.width / 2, this.config.height / 2))
            .force("collision", d3.forceCollide().radius(d => d.radius + 2))
            .alpha(this.config.simulationAlpha)
            .alphaDecay(this.config.simulationDecay)
            .on("tick", () => this.throttledUpdate());
    }
    
    // 节流更新以提高性能
    throttledUpdate() {
        const now = performance.now();
        if (now - this.lastUpdateTime >= this.updateThrottle) {
            this.updatePositions();
            this.lastUpdateTime = now;
        }
    }
    
    updatePositions() {
        // 使用更高效的批量更新
        const links = this.linkGroup.selectAll(".link");
        const nodes = this.nodeGroup.selectAll(".node");
        
        links
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        
        nodes
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    }
    
    drag() {
        const drag = d3.drag()
            .on("start", (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
        return drag;
    }
    
    // 搜索功能
    searchNode() {
        const searchId = d3.select("#searchInput").property("value");
        if (!searchId) return;
        
        const node = this.filteredData.nodes.find(d => d.id.toString() === searchId);
        if (node) {
            this.highlightNode(node);
            this.centerOnNode(node);
        } else {
            alert(`未找到节点 ID: ${searchId}`);
        }
    }
    
    clearSearch() {
        d3.select("#searchInput").property("value", "");
        this.clearHighlight();
    }
    
    highlightNode(node) {
        this.clearHighlight();
        
        // 高亮选中的节点
        this.nodeGroup.selectAll(".node")
            .filter(d => d.id === node.id)
            .classed("highlighted", true);
        
        // 高亮邻居节点
        this.nodeGroup.selectAll(".node")
            .filter(d => node.neighbors.has(d))
            .classed("neighbor", true);
        
        // 高亮相关连接
        this.linkGroup.selectAll(".link")
            .filter(d => d.source.id === node.id || d.target.id === node.id)
            .classed("highlighted", true);
        
        this.currentHighlighted = node;
        this.showNodeDetail(node);
    }
    
    clearHighlight() {
        this.nodeGroup.selectAll(".node")
            .classed("highlighted", false)
            .classed("neighbor", false);
        
        this.linkGroup.selectAll(".link")
            .classed("highlighted", false);
        
        this.currentHighlighted = null;
    }
    
    centerOnNode(node) {
        const scale = 2;
        const transform = d3.zoomIdentity
            .translate(this.config.width / 2 - node.x * scale, this.config.height / 2 - node.y * scale)
            .scale(scale);
        
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }
    
    // 筛选功能
    filterByDegree(maxDegree) {
        this.filteredData = {
            nodes: this.data.nodes.filter(d => d.degree <= maxDegree),
            links: this.data.links.filter(d => 
                d.source.degree <= maxDegree && d.target.degree <= maxDegree
            )
        };
        
        this.updateVisualization();
    }
    
    setDisplayMode(mode) {
        switch (mode) {
            case "all":
                this.showAllNodes();
                break;
            case "neighbors":
                this.showNeighborsOnly();
                break;
            case "highlighted":
                this.showHighlightedOnly();
                break;
        }
    }
    
    showAllNodes() {
        this.nodeGroup.selectAll(".node")
            .classed("hidden", false);
        this.linkGroup.selectAll(".link")
            .classed("hidden", false);
    }
    
    showNeighborsOnly() {
        if (!this.currentHighlighted) return;
        
        this.nodeGroup.selectAll(".node")
            .classed("hidden", d => d.id !== this.currentHighlighted.id && !this.currentHighlighted.neighbors.has(d));
        
        this.linkGroup.selectAll(".link")
            .classed("hidden", d => d.source.id !== this.currentHighlighted.id && d.target.id !== this.currentHighlighted.id);
    }
    
    showHighlightedOnly() {
        this.nodeGroup.selectAll(".node")
            .classed("hidden", d => !d3.select(this).classed("highlighted"));
        
        this.linkGroup.selectAll(".link")
            .classed("hidden", d => !d3.select(this).classed("highlighted"));
    }
    
    // 布局控制
    restartSimulation() {
        this.simulation.alpha(1).restart();
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.simulation.stop();
        } else {
            this.simulation.restart();
        }
        d3.select("#pauseSimulationBtn").text(this.isPaused ? "继续" : "暂停");
    }
    
    updateForceParameters() {
        const chargeStrength = parseInt(d3.select("#chargeStrength").property("value"));
        const linkDistance = parseInt(d3.select("#linkDistance").property("value"));
        
        this.simulation
            .force("charge", d3.forceManyBody().strength(chargeStrength))
            .force("link", d3.forceLink(this.filteredData.links)
                .id(d => d.id)
                .distance(linkDistance));
        
        this.simulation.alpha(0.3).restart();
    }
    
    // 缩放控制
    zoomIn() {
        this.svg.transition().call(this.zoom.scaleBy, 1.5);
    }
    
    zoomOut() {
        this.svg.transition().call(this.zoom.scaleBy, 1 / 1.5);
    }
    
    resetZoom() {
        this.svg.transition().call(this.zoom.transform, d3.zoomIdentity);
    }
    
    // 详情面板
    showNodeDetail(node) {
        const detailPanel = d3.select("#detailPanel");
        const detailContent = d3.select("#detailContent");
        
        detailContent.html(`
            <div class="node-detail">
                <h4>节点 ${node.id}</h4>
                <div class="detail-item">
                    <strong>度数:</strong> ${node.degree}
                </div>
                <div class="detail-item">
                    <strong>社群:</strong> ${node.group}
                </div>
                <div class="detail-item">
                    <strong>邻居数量:</strong> ${node.neighbors.size}
                </div>
                <div class="detail-item">
                    <strong>坐标:</strong> (${Math.round(node.x)}, ${Math.round(node.y)})
                </div>
                <div class="neighbors-list">
                    <h5>邻居节点:</h5>
                    <div class="neighbor-nodes">
                        ${Array.from(node.neighbors).slice(0, 10).map(n => 
                            `<span class="neighbor-tag" onclick="network.highlightNode(network.data.nodes.find(d => d.id === ${n.id}))">${n.id}</span>`
                        ).join("")}
                        ${node.neighbors.size > 10 ? `<span class="more-neighbors">...还有 ${node.neighbors.size - 10} 个</span>` : ""}
                    </div>
                </div>
            </div>
        `);
        
        detailPanel.classed("active", true);
    }
    
    closeDetailPanel() {
        d3.select("#detailPanel").classed("active", false);
    }
    
    // 导出功能
    exportPNG() {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const svgData = new XMLSerializer().serializeToString(this.svg.node());
        const img = new Image();
        
        canvas.width = this.config.width;
        canvas.height = this.config.height;
        
        img.onload = () => {
            ctx.fillStyle = "#f5f7fa";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            const link = document.createElement("a");
            link.download = "network_visualization.png";
            link.href = canvas.toDataURL();
            link.click();
        };
        
        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    }
    
    exportSVG() {
        const svgData = new XMLSerializer().serializeToString(this.svg.node());
        const blob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.download = "network_visualization.svg";
        link.href = url;
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    exportLayout() {
        const layout = {
            nodes: this.filteredData.nodes.map(d => ({
                id: d.id,
                x: d.x,
                y: d.y,
                fx: d.fx,
                fy: d.fy
            })),
            links: this.filteredData.links.map(d => ({
                source: d.source.id,
                target: d.target.id
            })),
            metadata: {
                exportTime: new Date().toISOString(),
                nodeCount: this.filteredData.nodes.length,
                linkCount: this.filteredData.links.length
            }
        };
        
        const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.download = "network_layout.json";
        link.href = url;
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    importLayout(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const layout = JSON.parse(e.target.result);
                this.applyLayout(layout);
            } catch (error) {
                alert("布局文件格式错误");
            }
        };
        reader.readAsText(file);
    }
    
    applyLayout(layout) {
        if (layout.nodes && layout.links) {
            // 更新节点位置
            layout.nodes.forEach(layoutNode => {
                const node = this.filteredData.nodes.find(d => d.id === layoutNode.id);
                if (node) {
                    node.x = layoutNode.x;
                    node.y = layoutNode.y;
                    node.fx = layoutNode.fx;
                    node.fy = layoutNode.fy;
                }
            });
            
            this.updatePositions();
            this.simulation.alpha(0.1).restart();
        }
    }
    
    // 工具提示
    showTooltip(event, d) {
        this.tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px")
            .style("display", "block")
            .html(`
                <strong>节点 ${d.id}</strong><br>
                度数: ${d.degree}<br>
                社群: ${d.group}<br>
                邻居: ${d.neighbors.size}
            `);
    }
    
    hideTooltip() {
        this.tooltip.style("display", "none");
    }
    
    // 更新可视化
    updateVisualization() {
        // 更新连接
        this.linkGroup.selectAll(".link")
            .data(this.filteredData.links)
            .join(
                enter => enter.append("line").attr("class", "link"),
                update => update,
                exit => exit.remove()
            );
        
        // 更新节点
        this.nodeGroup.selectAll(".node")
            .data(this.filteredData.nodes)
            .join(
                enter => enter.append("circle")
                    .attr("class", "node")
                    .attr("r", d => d.radius)
                    .attr("fill", d => d3.schemeCategory10[d.group % 10])
                    .attr("stroke", "#fff")
                    .attr("stroke-width", 1.5)
                    .call(this.drag())
                    .on("mouseover", (event, d) => this.showTooltip(event, d))
                    .on("mouseout", () => this.hideTooltip())
                    .on("click", (event, d) => this.showNodeDetail(d)),
                update => update,
                exit => exit.remove()
            );
        
        // 重新启动仿真
        this.simulation.nodes(this.filteredData.nodes);
        this.simulation.force("link").links(this.filteredData.links);
        this.simulation.alpha(1).restart();
        
        this.updateStatistics();
    }
    
    // 统计信息
    updateStatistics() {
        const nodes = this.filteredData.nodes;
        const links = this.filteredData.links;
        const degrees = nodes.map(d => d.degree);
        
        d3.select("#totalNodes").text(nodes.length);
        d3.select("#totalLinks").text(links.length);
        d3.select("#avgDegree").text((degrees.reduce((a, b) => a + b, 0) / degrees.length).toFixed(1));
        d3.select("#maxDegree").text(Math.max(...degrees));
    }
    
    // 加载状态
    showLoading(show) {
        d3.select("#loadingOverlay")
            .classed("hidden", !show);
    }
    
    // 窗口大小调整
    handleResize() {
        this.config.width = window.innerWidth;
        this.config.height = window.innerHeight - 120;
        
        this.svg
            .attr("width", this.config.width)
            .attr("height", this.config.height);
        
        this.simulation
            .force("center", d3.forceCenter(this.config.width / 2, this.config.height / 2))
            .restart();
    }
}

// 初始化应用
let network;
document.addEventListener("DOMContentLoaded", () => {
    network = new NetworkVisualization();
});
