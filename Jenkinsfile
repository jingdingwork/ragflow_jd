// RAGFlow_JD 一键构建 + 部署流水线（部署机 = Jenkins 本机）
// 链路：拉代码 → docker build(国内镜像加速) → 本机 docker compose 滚动更新
//
// 镜像本机构建完即在本地，部署无需 push/pull。
// 如需把镜像备份到 GitLab Registry，构建时勾 PUSH_REGISTRY=true（需建凭据 gitlab-registry）。
pipeline {
  // 固定工作目录：代码每次都拉到 /data/project/ragflow_jd，构建/部署都在这里
  // .env 放在 /data/project/ragflow_jd/docker/.env（只放一次，gitignore 不会被删）
  agent {
    node {
      label ''
      customWorkspace '/data/project/ragflow_jd'
    }
  }

  parameters {
    booleanParam(name: 'PUSH_REGISTRY', defaultValue: false,
      description: '是否把镜像推到 GitLab Registry 备份（部署机=本机时非必需）')
  }

  environment {
    REGISTRY = '172.27.1.90:5050'
    IMAGE    = '172.27.1.90:5050/ctcibj/ragflow_jd'
    TAG      = "${env.GIT_COMMIT ? env.GIT_COMMIT.take(8) : env.BUILD_NUMBER}"
  }

  options {
    timeout(time: 90, unit: 'MINUTES')         // 首次构建（含前端 build）较慢
    disableConcurrentBuilds()
  }

  stages {
    // 注：声明式管道已自动 checkout 代码（含 .git）到工作目录，无需再显式 checkout

    stage('Build Image') {
      steps {
        // 构建依赖镜像（多 stage mount 需要），内网拉不到可换华为云源后 retag
        sh 'docker pull infiniflow/ragflow_deps:latest || true'
        sh """
          docker build --build-arg NEED_MIRROR=1 \
            -f Dockerfile \
            -t ${IMAGE}:${TAG} \
            -t ${IMAGE}:latest .
        """
      }
    }

    stage('Push (optional)') {
      when { expression { return params.PUSH_REGISTRY } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'gitlab-registry',
            usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh 'echo "$REG_PASS" | docker login ' + "${REGISTRY}" + ' -u "$REG_USER" --password-stdin'
          sh "docker push ${IMAGE}:${TAG}"
          sh "docker push ${IMAGE}:latest"
        }
      }
    }

    stage('Deploy (local)') {
      steps {
        // 直接在工作目录的 docker/ 下起容器，复用同目录 .env（只需放一次）
        sh """
          cd docker
          export RAGFLOW_TAG=${TAG}
          docker compose -f docker-compose-deploy.yml up -d
          docker image prune -f
        """
      }
    }
  }

  post {
    success {
      echo "部署完成：${IMAGE}:${TAG}（本机）"
    }
  }
}
