// ========================================
// CONFIGURAÇÃO DA API GOOGLE SHEETS
// ========================================

const API_URL = 'https://script.google.com/macros/s/AKfycbywIo0NOt1f5T91mY9xpeaXogPL4SPgD0cAPmB5fcHLiMFQVLUr6gkpw2Ys9YAKpO57bA/exec';

// Função para fazer requisições à API
async function chamarAPI(action, dados = {}) {
    try {
        console.log('Chamando API:', action, dados);
        
        const form = new FormData();
        form.append('data', JSON.stringify({
            action: action,
            ...dados
        }));
        
        const response = await fetch(API_URL, {
            method: 'POST',
            body: form
        });
        
        const resultado = await response.json();
        console.log('Resposta da API:', resultado);
        
        if (!resultado.success) {
            console.error('Erro da API:', resultado.error);
            return null;
        }
        return resultado;
    } catch (error) {
        console.error('Erro de conexão:', error);
        return null;
    }
}

// ========================================
// VARIÁVEIS GLOBAIS
// ========================================

let funcionarios = [
    'Adriana', 'Ariany', 'Bruna Dias', 'Bruno Merez', 'Carina Gomes',
    'Daweld', 'Diego', 'Elza', 'Estefani', 'Flavia', 'Francisca',
    'Joseane', 'Marcelo Valente', 'Marcelo Aparecido', 'Nicolly Santos',
    'Roberto Alves', 'Vinicius Santos'
];

let mesAtual = 8;
let anoAtual = 2025;
let diaSelecionado = null;
let dadosSalvos = {};
let configFuncionarios = {};
let funcionarioAtual = null;

let feriadosGlobais = {
    '01-01': 'Confraternização Universal',
    '04-21': 'Tiradentes', 
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '12-25': 'Natal'
};
let feriadosCalendario = {};
let diaConfigurandoFeriado = null;
let tipoFeriadoSelecionado = null;

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

// Função consistente para formatação de chaves
function formatarChaveData(ano, mes, dia) {
    const mesStr = String(mes + 1).padStart(2, '0'); // mes + 1 porque JavaScript usa 0-11
    const diaStr = String(dia).padStart(2, '0');
    return `${ano}-${mesStr}-${diaStr}`;
}

function formatarHoras(horas) {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return h + "h" + m.toString().padStart(2, "0");
}

function converterHora(horaStr) {
    if (!horaStr) return { h: 0, m: 0 };
    const [h, m] = horaStr.split(':').map(Number);
    return { h: h || 0, m: m || 0 };
}

function obterJornadaDoDia(funcionarioIndex, diaSemana) {
    const config = configFuncionarios[funcionarioIndex];
    if (!config) return 8;

    const jornadas = [
        config.jornadaDom || 0,
        config.jornadaSeg || 0,
        config.jornadaTer || 0,
        config.jornadaQua || 0,
        config.jornadaQui || 0,
        config.jornadaSex || 0,
        config.jornadaSab || 0
    ];
    return jornadas[diaSemana];
}

function obterConfigFuncionario(funcionarioIndex) {
    const config = configFuncionarios[funcionarioIndex];
    return {
        salario: config ? config.salario : 3300,
        percentuais: config ? {
            p1: config.percentual1 || 50,
            p2: config.percentual2 || 50,
            p3: config.percentual3 || 50,
            p4: config.percentual4 || 50,
            p5: config.percentual5 || 50,
            folga: config.percentualFolga || 100
        } : {
            p1: 50, p2: 50, p3: 50, p4: 50, p5: 50, folga: 100
        },
        jornadaDescanso: config ? config.jornadaDescanso : 0
    };
}

function calcularPercentualEscalonado(horasExtras, percentuais) {
    let valorTotal = 0;
    let horasRestantes = horasExtras;

    const faixa1 = Math.min(horasRestantes, 2);
    if (faixa1 > 0) {
        valorTotal += faixa1 * (1 + percentuais.p1 / 100);
        horasRestantes -= faixa1;
    }

    const faixa2 = Math.min(horasRestantes, 1);
    if (faixa2 > 0) {
        valorTotal += faixa2 * (1 + percentuais.p2 / 100);
        horasRestantes -= faixa2;
    }

    const faixa3 = Math.min(horasRestantes, 1);
    if (faixa3 > 0) {
        valorTotal += faixa3 * (1 + percentuais.p3 / 100);
        horasRestantes -= faixa3;
    }

    const faixa4 = Math.min(horasRestantes, 1);
    if (faixa4 > 0) {
        valorTotal += faixa4 * (1 + percentuais.p4 / 100);
        horasRestantes -= faixa4;
    }

    if (horasRestantes > 0) {
        valorTotal += horasRestantes * (1 + percentuais.p5 / 100);
    }

    return valorTotal;
}

// ========================================
// INICIALIZAÇÃO E CARREGAMENTO
// ========================================

async function carregarDadosIniciais() {
    console.log('=== CARREGANDO DADOS INICIAIS ===');
    
    try {
        // Carregar configurações
        const configsResult = await chamarAPI('carregarConfigs');
        if (configsResult && configsResult.configs) {
            configFuncionarios = configsResult.configs;
            console.log('Configurações carregadas:', Object.keys(configFuncionarios).length);
            atualizarVisualConfigurados();
        }
        
        // Carregar feriados
        const feriadosResult = await chamarAPI('carregarFeriados');
        if (feriadosResult && feriadosResult.feriados) {
            feriadosCalendario = feriadosResult.feriados;
            console.log('Feriados carregados:', Object.keys(feriadosCalendario).length);
        }
        
        console.log('Dados iniciais carregados com sucesso!');
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
    }
    
    gerarCalendario();
}

// ========================================
// FUNÇÕES DO CALENDÁRIO
// ========================================

function gerarCalendario() {
    const calendario = document.getElementById('calendario');
    calendario.innerHTML = '';

    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    diasSemana.forEach(dia => {
        const div = document.createElement('div');
        div.className = 'dia-semana';
        div.textContent = dia;
        calendario.appendChild(div);
    });

    const primeiroDia = new Date(anoAtual, mesAtual, 1);
    const ultimoDia = new Date(anoAtual, mesAtual + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay();

    const mesAnteriorUltimoDia = new Date(anoAtual, mesAtual, 0).getDate();
    for (let i = diaSemanaInicio - 1; i >= 0; i--) {
        const div = document.createElement('div');
        div.className = 'dia outro-mes';
        div.textContent = mesAnteriorUltimoDia - i;
        calendario.appendChild(div);
    }

    for (let dia = 1; dia <= diasNoMes; dia++) {
        const div = document.createElement('div');
        div.className = 'dia';
        div.textContent = dia;
        
        div.onclick = () => selecionarDia(dia);
        div.oncontextmenu = (event) => abrirModalFeriado(dia, event);
        
        // Verificar se tem dados salvos
        const chaveData = formatarChaveData(anoAtual, mesAtual, dia);
        if (dadosSalvos[chaveData]) {
            div.classList.add('com-dados');
        }
        
        const feriado = verificarFeriado(dia, mesAtual, anoAtual);
        if (feriado) {
            div.classList.add('feriado');
            div.title = feriado.descricao;
        }
        
        calendario.appendChild(div);
    }

    const totalCelulas = calendario.children.length;
    const celulasFaltantes = 42 - totalCelulas;
    for (let dia = 1; dia <= celulasFaltantes; dia++) {
        const div = document.createElement('div');
        div.className = 'dia outro-mes';
        div.textContent = dia;
        calendario.appendChild(div);
    }

    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('mesAno').textContent = `${meses[mesAtual]} ${anoAtual}`;
}

function selecionarDia(dia) {
    console.log('=== SELECIONANDO DIA ===', dia);
    
    document.querySelectorAll('.dia.selecionado').forEach(d => d.classList.remove('selecionado'));
    const dias = document.querySelectorAll('.dia:not(.outro-mes)');
    dias[dia - 1].classList.add('selecionado');
    
    diaSelecionado = dia;
    document.getElementById('diaAtual').textContent = `${dia}/${mesAtual + 1}/${anoAtual}`;
    
    carregarDadosDia();
}

function mesAnterior() {
    mesAtual--;
    if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
    }
    diaSelecionado = null;
    document.getElementById('diaAtual').textContent = 'Selecione um dia';
    gerarCalendario();
    limparFormulario();
}

function proximoMes() {
    mesAtual++;
    if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
    }
    diaSelecionado = null;
    document.getElementById('diaAtual').textContent = 'Selecione um dia';
    gerarCalendario();
    limparFormulario();
}

// ========================================
// FUNÇÕES DE FERIADOS
// ========================================

function verificarFeriado(dia, mes, ano) {
    const chaveData = formatarChaveData(ano, mes, dia);
    const chaveDiaMes = String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    
    if (feriadosGlobais[chaveDiaMes]) {
        return { tipo: 'global', descricao: feriadosGlobais[chaveDiaMes] };
    }
    
    if (feriadosCalendario[chaveData]) {
        return { tipo: 'calendario', descricao: feriadosCalendario[chaveData].descricao };
    }
    
    return null;
}

function abrirModalFeriado(dia, event) {
    event.preventDefault();
    event.stopPropagation();
    
    diaConfigurandoFeriado = dia;
    document.getElementById('tituloFeriado').textContent = `Configurar ${dia}/${mesAtual + 1}/${anoAtual}`;
    
    document.querySelectorAll('.opcao-feriado').forEach(opcao => {
        opcao.classList.remove('selecionada');
    });
    
    tipoFeriadoSelecionado = null;
    document.getElementById('descricaoFeriado').style.display = 'none';
    document.getElementById('inputDescricao').value = '';
    
    const feriado = verificarFeriado(dia, mesAtual, anoAtual);
    if (feriado) {
        selecionarOpcaoFeriado('feriado');
        document.getElementById('inputDescricao').value = feriado.descricao;
    } else {
        selecionarOpcaoFeriado('normal');
    }
    
    document.getElementById('modalFeriado').style.display = 'block';
}

function selecionarOpcaoFeriado(tipo) {
    document.querySelectorAll('.opcao-feriado').forEach(opcao => {
        opcao.classList.remove('selecionada');
    });
    
    const opcao = document.getElementById(`opcao${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
    opcao.classList.add('selecionada');
    
    tipoFeriadoSelecionado = tipo;
    
    const campoDescricao = document.getElementById('descricaoFeriado');
    if (tipo === 'feriado') {
        campoDescricao.style.display = 'block';
    } else {
        campoDescricao.style.display = 'none';
    }
}

async function salvarFeriado() {
    if (!diaConfigurandoFeriado || !tipoFeriadoSelecionado) {
        alert('Selecione uma opção primeiro!');
        return;
    }
    
    const chaveData = formatarChaveData(anoAtual, mesAtual, diaConfigurandoFeriado);
    
    let resultado;
    if (tipoFeriadoSelecionado === 'normal') {
        delete feriadosCalendario[chaveData];
        resultado = await chamarAPI('salvarFeriado', {
            data: chaveData,
            remover: true
        });
    } else if (tipoFeriadoSelecionado === 'feriado') {
        const descricao = document.getElementById('inputDescricao').value || 'Feriado';
        feriadosCalendario[chaveData] = { tipo: 'feriado', descricao: descricao };
        resultado = await chamarAPI('salvarFeriado', {
            data: chaveData,
            tipo: 'feriado',
            descricao: descricao
        });
    } else if (tipoFeriadoSelecionado === 'especial') {
        feriadosCalendario[chaveData] = { tipo: 'especial', descricao: 'Dia Especial' };
        resultado = await chamarAPI('salvarFeriado', {
            data: chaveData,
            tipo: 'especial',
            descricao: 'Dia Especial'
        });
    }
    
    if (resultado) {
        gerarCalendario();
        if (diaSelecionado === diaConfigurandoFeriado) {
            calcularTodos();
        }
        fecharModal('modalFeriado');
        alert('Configuração do dia salva no Google Sheets!');
    } else {
        alert('Erro ao salvar configuração!');
    }
}

// ========================================
// FUNÇÕES DE FUNCIONÁRIOS
// ========================================

function abrirModalFuncionarios() {
    atualizarListaFuncionarios();
    document.getElementById('modalFuncionarios').style.display = 'block';
}

function atualizarListaFuncionarios() {
    const lista = document.getElementById('listaFuncionarios');
    lista.innerHTML = '';

    funcionarios.forEach((nome, index) => {
        const div = document.createElement('div');
        div.className = 'item-funcionario';
        div.innerHTML = `
            <div>
                <span class="nome-funcionario-lista">${nome}</span>
                ${configFuncionarios[index] ? '<span class="funcionario-configurado-lista">⚙️ Configurado</span>' : ''}
            </div>
            <button class="btn-remover" onclick="removerFuncionario(${index})">Remover</button>
        `;
        lista.appendChild(div);
    });
}

function adicionarFuncionario() {
    const input = document.getElementById('novoFuncionario');
    const nome = input.value.trim();

    if (!nome) {
        alert('Digite o nome do funcionário!');
        return;
    }

    if (funcionarios.includes(nome)) {
        alert('Este funcionário já está cadastrado!');
        return;
    }

    funcionarios.push(nome);
    input.value = '';
    atualizarListaFuncionarios();
    criarTabelas();
    
    if (diaSelecionado) {
        carregarDadosDia();
    }

    alert(`Funcionário "${nome}" adicionado com sucesso!`);
}

function removerFuncionario(index) {
    const nome = funcionarios[index];
    
    if (confirm(`Tem certeza que deseja remover "${nome}"?\n\nISTO IRÁ APAGAR:\n- Todos os registros de ponto salvos\n- Configurações individuais\n\nEsta ação não pode ser desfeita!`)) {
        delete configFuncionarios[index];
        
        const novasConfigs = {};
        funcionarios.forEach((_, i) => {
            if (i < index && configFuncionarios[i]) {
                novasConfigs[i] = configFuncionarios[i];
            } else if (i > index && configFuncionarios[i]) {
                novasConfigs[i - 1] = configFuncionarios[i];
            }
        });
        configFuncionarios = novasConfigs;

        funcionarios.splice(index, 1);

        Object.keys(dadosSalvos).forEach(chaveData => {
            const dados = dadosSalvos[chaveData];
            delete dados[index];
            
            const novosDados = {};
            Object.keys(dados).forEach(i => {
                const indice = parseInt(i);
                if (indice < index) {
                    novosDados[indice] = dados[indice];
                } else if (indice > index) {
                    novosDados[indice - 1] = dados[indice];
                }
            });
            dadosSalvos[chaveData] = novosDados;
        });

        atualizarListaFuncionarios();
        criarTabelas();
        
        if (diaSelecionado) {
            carregarDadosDia();
        }

        alert(`Funcionário "${nome}" removido com sucesso!`);
    }
}

// ========================================
// FUNÇÕES DE CONFIGURAÇÃO
// ========================================

function abrirModal(funcionarioIndex) {
    funcionarioAtual = funcionarioIndex;
    document.getElementById('modalTitulo').textContent = `Configurar ${funcionarios[funcionarioIndex]}`;
    
    const config = configFuncionarios[funcionarioIndex] || {
        salario: 3300,
        percentual1: 50, percentual2: 50, percentual3: 50, percentual4: 50, percentual5: 50,
        percentualFolga: 100,
        jornadaSeg: 8, jornadaTer: 8, jornadaQua: 8, jornadaQui: 8, jornadaSex: 8,
        jornadaSab: 4, jornadaDom: 0, jornadaDescanso: 0
    };

    Object.keys(config).forEach(key => {
        const elemento = document.getElementById(`config${key.charAt(0).toUpperCase() + key.slice(1)}`) || 
                        document.getElementById(key);
        if (elemento) elemento.value = config[key];
    });

    calcularTotalSemanal();
    document.getElementById('modalConfig').style.display = 'block';
}

function calcularTotalSemanal() {
    const total = 
        parseFloat(document.getElementById('jornadaSeg').value || 0) +
        parseFloat(document.getElementById('jornadaTer').value || 0) +
        parseFloat(document.getElementById('jornadaQua').value || 0) +
        parseFloat(document.getElementById('jornadaQui').value || 0) +
        parseFloat(document.getElementById('jornadaSex').value || 0) +
        parseFloat(document.getElementById('jornadaSab').value || 0) +
        parseFloat(document.getElementById('jornadaDom').value || 0);
    
    document.getElementById('totalSemanal').textContent = total.toFixed(1);
}

async function salvarConfiguracao() {
    if (funcionarioAtual === null) return;

    const config = {
        nome: funcionarios[funcionarioAtual],
        salario: parseFloat(document.getElementById('configSalario').value),
        percentual1: parseFloat(document.getElementById('percentual1').value),
        percentual2: parseFloat(document.getElementById('percentual2').value),
        percentual3: parseFloat(document.getElementById('percentual3').value),
        percentual4: parseFloat(document.getElementById('percentual4').value),
        percentual5: parseFloat(document.getElementById('percentual5').value),
        percentualFolga: parseFloat(document.getElementById('percentualFolga').value),
        jornadaSeg: parseFloat(document.getElementById('jornadaSeg').value),
        jornadaTer: parseFloat(document.getElementById('jornadaTer').value),
        jornadaQua: parseFloat(document.getElementById('jornadaQua').value),
        jornadaQui: parseFloat(document.getElementById('jornadaQui').value),
        jornadaSex: parseFloat(document.getElementById('jornadaSex').value),
        jornadaSab: parseFloat(document.getElementById('jornadaSab').value),
        jornadaDom: parseFloat(document.getElementById('jornadaDom').value),
        jornadaDescanso: parseFloat(document.getElementById('jornadaDescanso').value)
    };

    const resultado = await chamarAPI('salvarConfig', {
        funcionarioId: funcionarioAtual,
        config: config
    });

    if (resultado) {
        configFuncionarios[funcionarioAtual] = config;
        atualizarVisualConfigurados();
        calcularTodos();
        fecharModal('modalConfig');
        alert('Configuração salva no Google Sheets!');
    } else {
        alert('Erro ao salvar configuração!');
    }
}

function atualizarVisualConfigurados() {
    funcionarios.forEach((nome, i) => {
        const celulas = document.querySelectorAll(`[onclick*="abrirModal(${i})"]`);
        celulas.forEach(celula => {
            if (configFuncionarios[i]) {
                celula.classList.add('funcionario-configurado');
            } else {
                celula.classList.remove('funcionario-configurado');
            }
        });
    });
}

// ========================================
// FUNÇÕES DE DADOS - CORRIGIDAS
// ========================================

async function salvarDia() {
    if (!diaSelecionado) {
        alert('Selecione um dia primeiro!');
        return;
    }

    console.log('=== SALVANDO DIA ===');
    
    const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
    const dados = {};

    funcionarios.forEach((_, i) => {
        dados[i] = {
            entrada: document.getElementById(`entrada-${i}`).value,
            iniInt: document.getElementById(`iniInt-${i}`).value,
            fimInt: document.getElementById(`fimInt-${i}`).value,
            saida: document.getElementById(`saida-${i}`).value
        };
    });

    console.log('Dados para salvar:', { chaveData, dados });

    const resultado = await chamarAPI('salvarDia', {
        chaveData: chaveData,
        dados: dados
    });

    if (resultado && resultado.success) {
        // Salvar localmente também para acesso imediato
        dadosSalvos[chaveData] = dados;
        
        gerarCalendario();
        selecionarDia(diaSelecionado);
        alert('Dados salvos no Google Sheets!');
        console.log('Salvamento bem-sucedido!');
    } else {
        alert('Erro ao salvar dados! Verifique sua conexão.');
        console.error('Erro no salvamento:', resultado);
    }
}

async function carregarDadosDia() {
    if (!diaSelecionado) return;

    console.log('=== CARREGANDO DADOS DO DIA ===');
    
    const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
    console.log('Chave para buscar:', chaveData);
    
    // 1. Verificar cache local primeiro
    if (dadosSalvos[chaveData]) {
        console.log('Dados encontrados no cache local');
        preencherFormulario(dadosSalvos[chaveData]);
        return;
    }
    
    // 2. Buscar no Google Sheets
    console.log('Buscando no Google Sheets...');
    const resultado = await chamarAPI('carregarDia', {
        chaveData: chaveData
    });

    if (resultado && resultado.success && resultado.dados) {
        console.log('Dados carregados do Google Sheets:', resultado.dados);
        
        // Salvar no cache local
        dadosSalvos[chaveData] = resultado.dados;
        
        preencherFormulario(resultado.dados);
    } else {
        console.log('Nenhum dado encontrado - limpando formulário');
        limparFormulario();
    }
}

function preencherFormulario(dados) {
    console.log('Preenchendo formulário com:', dados);
    
    funcionarios.forEach((_, i) => {
        const d = dados[i] || {};
        const entrada = document.getElementById(`entrada-${i}`);
        const iniInt = document.getElementById(`iniInt-${i}`);
        const fimInt = document.getElementById(`fimInt-${i}`);
        const saida = document.getElementById(`saida-${i}`);
        
        if (entrada) entrada.value = d.entrada || '';
        if (iniInt) iniInt.value = d.iniInt || '';
        if (fimInt) fimInt.value = d.fimInt || '';
        if (saida) saida.value = d.saida || '';
    });
    
    calcularTodos();
}

function limparFormulario() {
    funcionarios.forEach((_, i) => {
        ['entrada', 'iniInt', 'fimInt', 'saida'].forEach(campo => {
            const elemento = document.getElementById(`${campo}-${i}`);
            if (elemento) elemento.value = '';
        });
    });
    calcularTodos();
}

async function limparDia() {
    if (!diaSelecionado) {
        alert('Selecione um dia primeiro!');
        return;
    }

    if (confirm('Tem certeza que deseja limpar os dados deste dia?')) {
        const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
        
        const resultado = await chamarAPI('salvarDia', {
            chaveData: chaveData,
            dados: {}
        });

        if (resultado && resultado.success) {
            delete dadosSalvos[chaveData];
            limparFormulario();
            gerarCalendario();
            selecionarDia(diaSelecionado);
            alert('Dados do dia limpos no Google Sheets!');
        } else {
            alert('Erro ao limpar dados!');
        }
    }
}

// ========================================
// FUNÇÕES DE TABELAS
// ========================================

function criarTabelas() {
    const tabelaEntrada = document.getElementById('tabelaEntrada');
    tabelaEntrada.innerHTML = '';
    
    funcionarios.forEach((nome, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="nome-funcionario" onclick="abrirModal(${i})">${nome}</td>
            <td><input type="time" class="campo-hora" id="entrada-${i}" onchange="calcularTodos()"></td>
            <td><input type="time" class="campo-hora" id="iniInt-${i}" onchange="calcularTodos()"></td>
            <td><input type="time" class="campo-hora" id="fimInt-${i}" onchange="calcularTodos()"></td>
            <td><input type="time" class="campo-hora" id="saida-${i}" onchange="calcularTodos()"></td>
            <td class="resultado" id="totalReal-${i}">0h00</td>
        `;
        tabelaEntrada.appendChild(tr);
    });

    const tabelaResumo = document.getElementById('tabelaResumo');
    tabelaResumo.innerHTML = '';
    
    funcionarios.forEach((nome, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="nome-funcionario" onclick="abrirModal(${i})">${nome}</td>
            <td class="resultado" id="horasNot-${i}">0h00</td>
            <td class="resultado" id="horasExt-${i}">0h00</td>
        `;
        tabelaResumo.appendChild(tr);
    });

    const tabelaValores = document.getElementById('tabelaValores');
    tabelaValores.innerHTML = '';
    
    funcionarios.forEach((nome, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="nome-funcionario" onclick="abrirModal(${i})">${nome}</td>
            <td class="resultado-valor" id="valorExt-${i}">R$ 0,00</td>
            <td class="resultado-valor" id="valorNot-${i}">R$ 0,00</td>
            <td class="resultado-valor" id="valorTot-${i}">R$ 0,00</td>
        `;
        tabelaValores.appendChild(tr);
    });

    atualizarVisualConfigurados();
}

// ========================================
// FUNÇÃO PRINCIPAL DE CÁLCULO
// ========================================

function calcularFuncionario(i) {
    // Verificar se os elementos existem antes de tentar usar
    const entradaEl = document.getElementById(`entrada-${i}`);
    const iniIntEl = document.getElementById(`iniInt-${i}`);
    const fimIntEl = document.getElementById(`fimInt-${i}`);
    const saidaEl = document.getElementById(`saida-${i}`);

    if (!entradaEl || !iniIntEl || !fimIntEl || !saidaEl) {
        console.warn(`Elementos não encontrados para funcionário ${i}`);
        return;
    }

    const entrada = converterHora(entradaEl.value);
    const iniInt = converterHora(iniIntEl.value);
    const fimInt = converterHora(fimIntEl.value);
    const saida = converterHora(saidaEl.value);

    // Função auxiliar para atualizar elementos com segurança
    function atualizarElemento(id, texto) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = texto;
        } else {
            console.warn(`Elemento ${id} não encontrado`);
        }
    }

    if (!entrada.h && !saida.h) {
        atualizarElemento(`totalReal-${i}`, '0h00');
        atualizarElemento(`horasTrab-${i}`, '0h00');
        atualizarElemento(`horasDiur-${i}`, '0h00');
        atualizarElemento(`horasNot-${i}`, '0h00');
        atualizarElemento(`horasExt-${i}`, '0h00');
        atualizarElemento(`valorExt-${i}`, 'R$ 0,00');
        atualizarElemento(`valorNot-${i}`, 'R$ 0,00');
        atualizarElemento(`valorTot-${i}`, 'R$ 0,00');
        return;
    }

    const config = obterConfigFuncionario(i);
    let jornadaDoDia;
    let ehFeriado = false;

    if (diaSelecionado) {
        const dataAtual = new Date(anoAtual, mesAtual, diaSelecionado);
        const diaSemana = dataAtual.getDay();
        jornadaDoDia = obterJornadaDoDia(i, diaSemana);

        const feriado = verificarFeriado(diaSelecionado, mesAtual, anoAtual);
        if (feriado) {
            ehFeriado = true;
            jornadaDoDia = config.jornadaDescanso;
        }

        if (dataAtual.getDay() === 0 && jornadaDoDia > 0) {
            const primeiroDomingo = new Date(anoAtual, mesAtual, 1);
            while (primeiroDomingo.getDay() !== 0) {
                primeiroDomingo.setDate(primeiroDomingo.getDate() + 1);
            }
            
            const quartoDomingo = new Date(primeiroDomingo);
            quartoDomingo.setDate(primeiroDomingo.getDate() + 21);
            
            if (diaSelecionado === quartoDomingo.getDate() && 
                quartoDomingo.getMonth() === mesAtual) {
                ehFeriado = true;
                jornadaDoDia = config.jornadaDescanso;
            }
        }
    } else {
        jornadaDoDia = 8;
    }

    let totalMinutos = (saida.h * 60 + saida.m) - (entrada.h * 60 + entrada.m);
    if (iniInt.h && fimInt.h && fimInt.h >= iniInt.h) {
        totalMinutos -= (fimInt.h * 60 + fimInt.m) - (iniInt.h * 60 + iniInt.m);
    }
    const totalReal = totalMinutos / 60;

    let minutosNoturnoReais = 0;
    
    if (entrada.h < 5) {
        minutosNoturnoReais += Math.max(0, Math.min(saida.h * 60 + saida.m, 5 * 60) - (entrada.h * 60 + entrada.m));
    }
    
    if (saida.h >= 22) {
        minutosNoturnoReais += Math.max(0, (saida.h * 60 + saida.m) - Math.max(entrada.h * 60 + entrada.m, 22 * 60));
    }
    
    if (iniInt.h && fimInt.h) {
        if ((iniInt.h < 5 && fimInt.h <= 5) || (iniInt.h >= 22 && fimInt.h >= 22)) {
            minutosNoturnoReais -= (fimInt.h * 60 + fimInt.m) - (iniInt.h * 60 + iniInt.m);
        }
    }
    
    minutosNoturnoReais = Math.max(0, minutosNoturnoReais);

    const horasNoturnas = minutosNoturnoReais / 52.5;
    const horasDiurnas = totalReal - (minutosNoturnoReais / 60);
    const horasTrabalhadas = horasDiurnas + horasNoturnas;

    const horasExtras = Math.max(0, horasTrabalhadas - jornadaDoDia);

    const salarioBase = config.salario;
    const valorHoraNormal = salarioBase / 220;
    const extrasNormais = Math.max(0, horasDiurnas - jornadaDoDia);

    let valorExtras;
    
    if (ehFeriado) {
        valorExtras = extrasNormais * valorHoraNormal * (1 + config.percentuais.folga / 100);
    } else {
        valorExtras = calcularPercentualEscalonado(extrasNormais, config.percentuais) * valorHoraNormal;
    }

    const valorNoturno = horasNoturnas * valorHoraNormal * 0.20;
    const valorTotal = valorExtras + valorNoturno;

    // Usar a função auxiliar para atualizar todos os elementos
    atualizarElemento(`totalReal-${i}`, formatarHoras(totalReal));
    atualizarElemento(`horasTrab-${i}`, formatarHoras(horasTrabalhadas));
    atualizarElemento(`horasDiur-${i}`, formatarHoras(horasDiurnas));
    atualizarElemento(`horasNot-${i}`, formatarHoras(horasNoturnas));
    atualizarElemento(`horasExt-${i}`, formatarHoras(horasExtras));
    atualizarElemento(`valorExt-${i}`, 'R$ ' + valorExtras.toFixed(2));
    atualizarElemento(`valorNot-${i}`, 'R$ ' + valorNoturno.toFixed(2));
    atualizarElemento(`valorTot-${i}`, 'R$ ' + valorTotal.toFixed(2));
}

function calcularTodos() {
    funcionarios.forEach((_, i) => calcularFuncionario(i));
}

// ========================================
// FUNÇÕES DE MODAL
// ========================================

function fecharModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    if (modalId === 'modalConfig') {
        funcionarioAtual = null;
    } else if (modalId === 'modalFeriado') {
        diaConfigurandoFeriado = null;
        tipoFeriadoSelecionado = null;
    } else if (modalId === 'modalFuncionarios') {
        document.getElementById('novoFuncionario').value = '';
    }
}

// ========================================
// FUNÇÕES DE DIAGNÓSTICO
// ========================================

// Função para diagnóstico - pode ser chamada no console
function diagnosticarSistema() {
    console.log('=== DIAGNÓSTICO DO SISTEMA ===');
    console.log('Data atual:', new Date());
    console.log('Mês/Ano atual:', mesAtual, anoAtual);
    console.log('Dia selecionado:', diaSelecionado);
    
    if (diaSelecionado) {
        const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
        console.log('Chave data formatada:', chaveData);
        console.log('Dados salvos localmente:', dadosSalvos[chaveData]);
    }
    
    console.log('Total de dados salvos:', Object.keys(dadosSalvos).length);
    console.log('Todas as chaves:', Object.keys(dadosSalvos));
    console.log('Configurações de funcionários:', Object.keys(configFuncionarios).length);
    console.log('Feriados configurados:', Object.keys(feriadosCalendario).length);
}

// Função para sincronizar dados do mês atual
async function sincronizarMesAtual() {
    console.log('=== SINCRONIZANDO MÊS ATUAL ===');
    
    const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const chaveData = formatarChaveData(anoAtual, mesAtual, dia);
        
        console.log(`Verificando ${dia}/${mesAtual + 1}/${anoAtual}...`);
        
        const resultado = await chamarAPI('carregarDia', {
            chaveData: chaveData
        });
        
        if (resultado && resultado.success && resultado.dados) {
            dadosSalvos[chaveData] = resultado.dados;
            console.log(`✓ Dados encontrados para ${dia}/${mesAtual + 1}`);
        } else {
            console.log(`- Sem dados para ${dia}/${mesAtual + 1}`);
        }
        
        // Pausa para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('Sincronização concluída! Atualizando calendário...');
    gerarCalendario();
}

// ========================================
// EVENT LISTENERS E INICIALIZAÇÃO
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== INICIANDO SISTEMA ===');
    
    // Event listeners para cálculo do total semanal
    ['jornadaSeg', 'jornadaTer', 'jornadaQua', 'jornadaQui', 'jornadaSex', 'jornadaSab', 'jornadaDom', 'jornadaDescanso'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', calcularTotalSemanal);
        }
    });

    // Inicialização do sistema
    criarTabelas();
    carregarDadosIniciais();
    
    console.log('Sistema inicializado! Use diagnosticarSistema() no console para debug.');
});

// Event listener para fechar modais clicando fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Disponibilizar funções de diagnóstico globalmente
window.diagnosticarSistema = diagnosticarSistema;
window.sincronizarMesAtual = sincronizarMesAtual;
