// ========================================
// CONFIGURAÇÃO DA API GOOGLE SHEETS
// ========================================

const API_URL = 'https://script.google.com/macros/s/AKfycbzc7Bv207SBqfiers5lEevwx_H9L2fflTMbjKsXvWglQD2Zl2IbPXmPTuaw7h9CjghGvw/exec';

// Função para fazer requisições à API (versão sem CORS)
async function chamarAPI(action, dados = {}) {
    try {
        console.log('Chamando API:', action);
        
        // Criar formulário para evitar CORS
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
        if (!resultado.success) {
            console.error('Erro da API:', resultado.error);
            return null;
        }
        console.log('API sucesso:', action);
        return resultado;
    } catch (error) {
        console.error('Erro de conexão:', error);
        return null;
    }
}

async function carregarDadosIniciais() {
    console.log('Carregando dados salvos do Google Sheets...');
    
    try {
        // Carregar funcionários
        const funcionariosResult = await chamarAPI('carregarFuncionarios');
        if (funcionariosResult && funcionariosResult.funcionarios && funcionariosResult.funcionarios.length > 0) {
            funcionarios = funcionariosResult.funcionarios;
            funcionarios.sort((a, b) => a.localeCompare(b, 'pt-BR'));
            console.log('Funcionários carregados:', funcionarios.length);
        } else {
            funcionarios.sort((a, b) => a.localeCompare(b, 'pt-BR'));
        }
        
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
        
        // SINCRONIZAR DADOS DOS DIAS
        await sincronizarComGoogleSheets();
        
        console.log('Todos os dados carregados do Google Sheets!');
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        funcionarios.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }
    
    criarTabelas();
    gerarCalendario();
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

// Variável para controlar quando pular o carregamento
let saltarCarregamento = false;

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

// Função para padronizar formato de datas
function formatarChaveData(ano, mes, dia) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
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
    const nomeFuncionario = funcionarios[funcionarioIndex];
    const config = configFuncionarios[nomeFuncionario];
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
    const nomeFuncionario = funcionarios[funcionarioIndex];
    const config = configFuncionarios[nomeFuncionario];
    
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

// Função de debug melhorada
function debugChaves() {
    console.log('=== DEBUG COMPLETO ===');
    console.log('Dados salvos localmente:', Object.keys(dadosSalvos));
    console.log('Feriados do calendário:', Object.keys(feriadosCalendario));
    
    if (diaSelecionado) {
        const chaveNova = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
        const chaveAntiga = `${anoAtual}-${mesAtual}-${diaSelecionado}`;
        console.log('Dia selecionado:', diaSelecionado);
        console.log('Chave nova:', chaveNova);
        console.log('Chave antiga:', chaveAntiga);
        console.log('Dados na chave nova:', dadosSalvos[chaveNova]);
        console.log('Dados na chave antiga:', dadosSalvos[chaveAntiga]);
    }
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
        
        const chaveData = formatarChaveData(anoAtual, mesAtual, dia);
        const chaveAntiga = `${anoAtual}-${mesAtual}-${dia}`;
        
        const temDados = Object.keys(dadosSalvos).some(chave => 
            chave.startsWith(chaveData) || chave === chaveAntiga
        );
        
        if (temDados) {
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
    console.log('Selecionando dia:', dia);
    
    document.querySelectorAll('.dia.selecionado').forEach(d => d.classList.remove('selecionado'));
    const dias = document.querySelectorAll('.dia:not(.outro-mes)');
    dias[dia - 1].classList.add('selecionado');
    
    diaSelecionado = dia;
    document.getElementById('diaAtual').textContent = `${dia}/${mesAtual + 1}/${anoAtual}`;
    
    if (!saltarCarregamento) {
        carregarDadosDia();
    } else {
        console.log('Saltando carregamento - dados já estão na tela');
        saltarCarregamento = false;
    }
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
    
    const chaveAntiga = `${ano}-${mes}-${dia}`;
    if (feriadosCalendario[chaveData] || feriadosCalendario[chaveAntiga]) {
        const feriado = feriadosCalendario[chaveData] || feriadosCalendario[chaveAntiga];
        return { tipo: 'calendario', descricao: feriado.descricao };
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
                ${configFuncionarios[nome] ? '<span class="funcionario-configurado-lista">⚙️ Configurado</span>' : ''}
            </div>
            <button class="btn-remover" onclick="removerFuncionario(${index})">Remover</button>
        `;
        lista.appendChild(div);
    });
}

async function adicionarFuncionario() {
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
    
    // ORDENAR ALFABETICAMENTE
    funcionarios.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    
    // Salvar no Google Sheets
    const resultado = await chamarAPI('salvarFuncionarios', {
        funcionarios: funcionarios
    });

    if (resultado) {
        input.value = '';
        atualizarListaFuncionarios();
        criarTabelas();
        
        if (diaSelecionado) {
            carregarDadosDia();
        }

        alert(`Funcionário "${nome}" adicionado e salvo no Google Sheets!`);
    } else {
        const index = funcionarios.indexOf(nome);
        if (index > -1) {
            funcionarios.splice(index, 1);
        }
        alert('Erro ao salvar funcionário no Google Sheets!');
    }
}

async function removerFuncionario(index) {
    const nome = funcionarios[index];
    
    if (confirm(`Tem certeza que deseja remover "${nome}"?\n\nISTO IRÁ APAGAR:\n- Todos os registros de ponto salvos\n- Configurações individuais\n\nEsta ação não pode ser desfeita!`)) {
        const funcionariosBackup = [...funcionarios];
        const configsBackup = {...configFuncionarios};
        
        delete configFuncionarios[nome];
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

        const resultado = await chamarAPI('salvarFuncionarios', {
            funcionarios: funcionarios
        });

        if (resultado) {
            atualizarListaFuncionarios();
            criarTabelas();
            
            if (diaSelecionado) {
                carregarDadosDia();
            }

            alert(`Funcionário "${nome}" removido e atualizado no Google Sheets!`);
        } else {
            funcionarios = funcionariosBackup;
            configFuncionarios = configsBackup;
            alert('Erro ao atualizar Google Sheets! Mudanças revertidas.');
        }
    }
}

// ========================================
// FUNÇÕES DE CONFIGURAÇÃO
// ========================================

function abrirModal(funcionarioIndex) {
    funcionarioAtual = funcionarioIndex;
    const nomeFuncionario = funcionarios[funcionarioIndex];
    document.getElementById('modalTitulo').textContent = `Configurar ${nomeFuncionario}`;
    
    const config = configFuncionarios[nomeFuncionario] || {
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

    const nomeFuncionario = funcionarios[funcionarioAtual];
    
    const config = {
        nome: nomeFuncionario,
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
        funcionarioNome: nomeFuncionario,
        config: config
    });

    if (resultado) {
        configFuncionarios[nomeFuncionario] = config;
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
            if (configFuncionarios[nome]) {
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

    console.log('Salvando dados no Google Sheets...');
    
    const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
    const dados = {};

    // USAR NOMES EM VEZ DE ÍNDICES
    funcionarios.forEach((nomeFuncionario, i) => {
        dados[nomeFuncionario] = {
            entrada: document.getElementById(`entrada-${i}`).value,
            iniInt: document.getElementById(`iniInt-${i}`).value,
            fimInt: document.getElementById(`fimInt-${i}`).value,
            saida: document.getElementById(`saida-${i}`).value
        };
    });

    console.log('Dados a serem salvos (por nome):', dados);

    const resultado = await chamarAPI('salvarDia', {
        chaveData: chaveData,
        dados: dados
    });

    if (resultado) {
        saltarCarregamento = true;
        dadosSalvos[chaveData] = dados;
        gerarCalendario();
        selecionarDia(diaSelecionado);
        alert('Dados salvos no Google Sheets!');
    } else {
        alert('Erro ao salvar dados! Verifique sua conexão.');
    }
}

async function carregarDadosDia() {
    if (!diaSelecionado) return;

    const chaveData = formatarChaveData(anoAtual, mesAtual, diaSelecionado);
    
    console.log('=== DEBUG CARREGAMENTO ===');
    console.log('Dia selecionado:', diaSelecionado);
    console.log('Chave:', chaveData);
    
    // PRIMEIRO: Verificar dados locais (cache)
    let dados = dadosSalvos[chaveData];
    
    if (dados) {
        console.log('Usando dados locais salvos');
        preencherFormulario(dados);
        return;
    }
    
    // SEGUNDO: Tentar carregar do Google Sheets
    console.log('Tentando carregar do Google Sheets...');
    const resultado = await chamarAPI('carregarDia', {
        chaveData: chaveData
    });

    console.log('Resultado do Google Sheets:', resultado);
    
    if (resultado && resultado.dados) {
        console.log('Dados encontrados no Google Sheets');
        dados = resultado.dados;
        dadosSalvos[chaveData] = dados;
        preencherFormulario(dados);
    } else {
        console.log('Nenhum dado encontrado - limpando formulário');
        limparFormulario();
    }
}

// ADICIONE esta função no seu script.js, logo após a função carregarDadosDia()

async function sincronizarComGoogleSheets() {
    console.log('🔄 Sincronizando dados com Google Sheets...');
    
    try {
        // Listar todas as chaves salvas
        const resultado = await chamarAPI('listarChaves');
        
        if (resultado && resultado.chaves) {
            console.log(`📊 Encontradas ${resultado.chaves.length} chaves na planilha`);
            
            // Para cada chave, carregar e salvar no cache local
            for (const item of resultado.chaves) {
                if (item.temDados === 'Sim') {
                    console.log(`📥 Carregando: ${item.chave}`);
                    
                    // Tentar carregar com a chave exata
                    const dados = await chamarAPI('carregarDia', {
                        chaveData: item.chave
                    });
                    
                    if (dados && dados.dados) {
                        // Extrair apenas a parte da data (2025-09-27)
                        const chaveSimples = item.chave.substring(0, 10);
                        
                        // Salvar no cache local com chave simples
                        dadosSalvos[chaveSimples] = dados.dados;
                        console.log(`✅ Sincronizado: ${chaveSimples}`);
                    }
                }
            }
            
            console.log('🎉 Sincronização concluída!');
            console.log('📦 Dados no cache:', Object.keys(dadosSalvos));
            
            // Atualizar calendário para mostrar dias com dados
            gerarCalendario();
            
        }
    } catch (error) {
        console.log('❌ Erro na sincronização:', error);
    }
}


// ========================================
// FUNÇÃO PREENCHIMENTO CORRIGIDA
// ========================================
function preencherFormulario(dados) {
    console.log('Preenchendo formulário com dados:', dados);
    
    funcionarios.forEach((nomeFuncionario, i) => {
        // BUSCAR DADOS POR NOME DO FUNCIONÁRIO
        const dadosFuncionario = dados[nomeFuncionario];
        
        if (dadosFuncionario) {
            console.log(`Preenchendo dados de ${nomeFuncionario}:`, dadosFuncionario);
            document.getElementById(`entrada-${i}`).value = dadosFuncionario.entrada || '';
            document.getElementById(`iniInt-${i}`).value = dadosFuncionario.iniInt || '';
            document.getElementById(`fimInt-${i}`).value = dadosFuncionario.fimInt || '';
            document.getElementById(`saida-${i}`).value = dadosFuncionario.saida || '';
        } else {
            // Limpar campos se não há dados para este funcionário
            document.getElementById(`entrada-${i}`).value = '';
            document.getElementById(`iniInt-${i}`).value = '';
            document.getElementById(`fimInt-${i}`).value = '';
            document.getElementById(`saida-${i}`).value = '';
        }
    });
    
    calcularTodos();
}

// ADICIONE A FUNÇÃO AQUI:
function limparFormulario() {
    console.log('Limpando formulário...');
    
    funcionarios.forEach((nomeFuncionario, i) => {
        const campos = ['entrada', 'iniInt', 'fimInt', 'saida'];
        
        campos.forEach(campo => {
            const elemento = document.getElementById(`${campo}-${i}`);
            if (elemento) {
                elemento.value = '';
            }
        });
        
        // Limpar também os campos de resultado
        const resultados = ['totalReal', 'horasTrab', 'horasDiur', 'horasNot', 'horasExt', 'valorExt', 'valorNot', 'valorTot'];
        resultados.forEach(resultado => {
            const elemento = document.getElementById(`${resultado}-${i}`);
            if (elemento) {
                if (resultado.includes('valor') || resultado.includes('Valor')) {
                    elemento.textContent = 'R$ 0,00';
                } else {
                    elemento.textContent = '0h00';
                }
            }
        });
    });
    
    console.log('Formulário limpo!');
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

        if (resultado) {
            delete dadosSalvos[chaveData];
            const chaveAntiga = `${anoAtual}-${mesAtual}-${diaSelecionado}`;
            delete dadosSalvos[chaveAntiga];
            
            limparFormulario();
            gerarCalendario();
            selecionarDia(diaSelecionado);
            alert('Dados do dia limpos no Google Sheets!');
        } else {
            alert('Erro ao limpar dados!');
        }
    }
}

// Função para sincronizar dados existentes (executar UMA VEZ no console)
async function sincronizarDadosExistentes() {
    console.log('Iniciando sincronização de dados existentes...');
    
    // Tentar carregar dados dos últimos 30 dias
    const hoje = new Date();
    for (let i = 0; i < 30; i++) {
        const data = new Date(hoje);
        data.setDate(hoje.getDate() - i);
        
        const ano = data.getFullYear();
        const mes = data.getMonth();
        const dia = data.getDate();
        
        const chaveData = formatarChaveData(ano, mes, dia);
        
        console.log(`Verificando ${chaveData}...`);
        
        const resultado = await chamarAPI('carregarDia', {
            chaveData: chaveData
        });
        
        if (resultado && resultado.dados) {
            console.log(`Dados encontrados para ${chaveData}`);
            dadosSalvos[chaveData] = resultado.dados;
        }
        
        // Pausa de 100ms para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('Sincronização concluída!');
    console.log('Dados sincronizados:', Object.keys(dadosSalvos));
    
    // Atualizar calendário
    console.log('Atualizando calendário...');
    gerarCalendario();
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
            <td class="resultado" id="horasTrab-${i}">0h00</td>
            <td class="resultado" id="horasDiur-${i}">0h00</td>
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
    const entrada = converterHora(document.getElementById(`entrada-${i}`).value);
    const iniInt = converterHora(document.getElementById(`iniInt-${i}`).value);
    const fimInt = converterHora(document.getElementById(`fimInt-${i}`).value);
    const saida = converterHora(document.getElementById(`saida-${i}`).value);

    if (!entrada.h && !saida.h) {
        document.getElementById(`totalReal-${i}`).textContent = '0h00';
        document.getElementById(`horasTrab-${i}`).textContent = '0h00';
        document.getElementById(`horasDiur-${i}`).textContent = '0h00';
        document.getElementById(`horasNot-${i}`).textContent = '0h00';
        document.getElementById(`horasExt-${i}`).textContent = '0h00';
        document.getElementById(`valorExt-${i}`).textContent = 'R$ 0,00';
        document.getElementById(`valorNot-${i}`).textContent = 'R$ 0,00';
        document.getElementById(`valorTot-${i}`).textContent = 'R$ 0,00';
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

    document.getElementById(`totalReal-${i}`).textContent = formatarHoras(totalReal);
    document.getElementById(`horasTrab-${i}`).textContent = formatarHoras(horasTrabalhadas);
    document.getElementById(`horasDiur-${i}`).textContent = formatarHoras(horasDiurnas);
    document.getElementById(`horasNot-${i}`).textContent = formatarHoras(horasNoturnas);
    document.getElementById(`horasExt-${i}`).textContent = formatarHoras(horasExtras);
    document.getElementById(`valorExt-${i}`).textContent = 'R$ ' + valorExtras.toFixed(2);
    document.getElementById(`valorNot-${i}`).textContent = 'R$ ' + valorNoturno.toFixed(2);
    document.getElementById(`valorTot-${i}`).textContent = 'R$ ' + valorTotal.toFixed(2);
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
// EVENT LISTENERS E INICIALIZAÇÃO
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Sistema iniciando...');
    
    ['jornadaSeg', 'jornadaTer', 'jornadaQua', 'jornadaQui', 'jornadaSex', 'jornadaSab', 'jornadaDom', 'jornadaDescanso'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', calcularTotalSemanal);
        }
    });

    criarTabelas();
    carregarDadosIniciais();
    
    console.log('Sistema inicializado!');
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

window.debugChaves = debugChaves;
window.sincronizarDadosExistentes = sincronizarDadosExistentes;
